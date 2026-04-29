import chalk from 'chalk';
import { tokenize, detectRedirects } from './tokenizer.js';
import { lookupCommand, lookupCompound, dbExists } from './tldr.js';
import { explainFlags } from './flags.js';
import { checkDanger, renderDangerLines } from './danger.js';
import { getArgumentContext } from './context.js';

export function explain(commandString) {
  const segments = tokenize(commandString).filter(Boolean);
  if (!segments.length) return null;

  const results = segments.map(resolveSegment);
  return format(commandString, results);
}

function resolveSegment({ command, subcommand, flags, args, raw }) {
  // sudo transparency: look up the real command instead of sudo itself
  if (command === 'sudo' && subcommand) {
    const realCmd = subcommand;
    // args[0] may be the subcommand of the real command (e.g. "git commit" → args[0]="commit")
    const realSub = args[0] && /^[a-z][a-z0-9_-]*$/i.test(args[0]) ? args[0] : null;
    const realArgs = realSub ? args.slice(1) : args;

    const compoundTldr = realSub ? lookupCompound(realCmd, realSub) : null;
    const tldr = compoundTldr ?? lookupCommand(realCmd);
    const resolvedSub = compoundTldr ? realSub : null;

    return {
      label: resolvedSub ? `sudo ${realCmd} ${resolvedSub}` : `sudo ${realCmd}`,
      description: tldr?.description ?? null,
      flags: explainFlags(realCmd, resolvedSub, flags),
      context: getArgumentContext(realCmd, realSub, realArgs, flags),
      redirects: detectRedirects(raw),
      isSudo: true,
    };
  }

  // Normal resolution: try compound name (git-commit) first, fall back to base
  const compoundTldr = subcommand ? lookupCompound(command, subcommand) : null;
  const tldr = compoundTldr ?? lookupCommand(command);
  const resolvedSub = compoundTldr ? subcommand : null;

  return {
    label: resolvedSub ? `${command} ${resolvedSub}` : command,
    description: tldr?.description ?? null,
    flags: explainFlags(command, resolvedSub, flags),
    // Use original tokenizer subcommand (not tldr-resolved) so context handlers
    // fire even when tldr DB doesn't have the compound entry
    context: getArgumentContext(command, subcommand, args, flags),
    redirects: detectRedirects(raw),
    isSudo: false,
  };
}

function describeRedirect({ op, fd, target }) {
  if (op === '2>&1') {
    return 'stderr (error messages) is merged into stdout so both appear in the same stream — useful before a pipe so errors aren\'t lost';
  }
  if (/^>&/.test(op)) {
    return 'stdout and stderr are combined into a single stream';
  }
  const stream = fd === '2' ? 'stderr (error messages)' : 'stdout (normal output)';
  const dest = target ? `'${target}'` : 'a file';
  if (op === '>>') return `${stream} is appended to ${dest} — existing content is preserved`;
  if (op === '>') return `${stream} is written to ${dest} — this overwrites any existing content`;
  if (op === '<') return target ? `stdin reads from '${target}' instead of the keyboard` : 'stdin is read from a file';
  return null;
}

function format(raw, results) {
  // Adapt to terminal width: box is W+3 chars wide, leave 1-char margin
  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const lines = [];

  lines.push(dim('┌') + chalk.bold.cyan(' wtflag ') + dim('─'.repeat(W - 7) + '┐'));
  lines.push(dim('│ ') + highlightCommand(truncate(raw, W - 2)));
  lines.push(dim('│'));

  const dangers = checkDanger(raw);
  if (dangers.length) {
    lines.push(...renderDangerLines(dangers, dim));
    lines.push(dim('│'));
  }

  // Pipeline summary: one-liner showing the data flow across all segments
  if (results.length > 1) {
    const ctxParts = results.map(r => r.context).filter(Boolean);
    if (ctxParts.length > 1) {
      const summary = ctxParts.join(' → ');
      lines.push(dim('│ ') + chalk.dim('↳ ') + chalk.dim.italic(truncate(summary, W - 4)));
      lines.push(dim('│'));
    }
  }

  for (const { label, description, flags, context, redirects, isSudo } of results) {
    const desc = description ?? dim('not in tldr database');
    const sudoBadge = isSudo ? chalk.bgMagenta.white.bold(' SUDO ') + ' ' : '';
    lines.push(dim('│ ') + sudoBadge + chalk.bold(label) + dim(' — ') + desc);

    if (context) {
      lines.push(dim('│   ') + chalk.dim('→ ') + chalk.dim.italic(context));
    }

    if (redirects.length) {
      for (const r of redirects) {
        const rdesc = describeRedirect(r);
        if (rdesc) lines.push(dim('│   ') + chalk.dim('⇒ ') + chalk.dim.italic(rdesc));
      }
    }

    if (flags.length) {
      lines.push(dim('│'));
      for (const { flag, description: flagDesc } of flags) {
        lines.push(dim('│   ') + chalk.yellow(flag.padEnd(14)) + flagDesc);
      }
    }

    if (results.length > 1) lines.push(dim('│'));
  }

  if (!dbExists()) {
    lines.push(dim('│'));
    lines.push(dim('│  ') + chalk.dim('Run `wtflag update-db` to enable full descriptions.'));
  }

  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}

// Syntax-color a shell command string for display in the box header.
// Rules: command name → bold cyan, flags → yellow, quoted strings → green,
//        pipe/logic operators → dim, redirect operators → dim magenta, args → white.
function highlightCommand(raw) {
  let out = '';
  let i = 0;
  let inSingle = false, inDouble = false;
  let segmentStart = true;

  const peek = (s) => raw.startsWith(s, i);

  while (i < raw.length) {
    const ch = raw[i];

    // Spaces (outside quotes pass through unchanged)
    if (ch === ' ' && !inSingle && !inDouble) {
      out += ' '; i++; continue;
    }

    // Operators — only recognized outside quotes
    if (!inSingle && !inDouble) {
      if (peek('2>&1')) { out += chalk.dim('2>&1'); i += 4; continue; }
      if (peek('>>'))   { out += chalk.dim.magenta('>>'); i += 2; continue; }
      if (peek('&&') || peek('||')) {
        out += chalk.dim(raw.slice(i, i + 2)); i += 2; segmentStart = true; continue;
      }
      if (ch === '>')   { out += chalk.dim.magenta('>'); i++; continue; }
      if (ch === '<' && !peek('<<')) { out += chalk.dim.magenta('<'); i++; continue; }
      if (ch === '|' || ch === ';') {
        out += chalk.dim(ch); i++; segmentStart = true; continue;
      }
    }

    // Read the next word (respecting open quotes)
    let word = '';
    while (i < raw.length) {
      const c = raw[i];
      if (c === "'" && !inDouble) { inSingle = !inSingle; word += c; i++; continue; }
      if (c === '"' && !inSingle) { inDouble = !inDouble; word += c; i++; continue; }
      // Stop at unquoted whitespace or operators
      if (!inSingle && !inDouble &&
          (c === ' ' || c === '|' || c === ';' || c === '&' || c === '>' || c === '<')) break;
      word += c; i++;
    }

    if (!word) { i++; continue; }

    if (word.startsWith('-')) {
      out += chalk.yellow(word);
    } else if (word.startsWith("'") || word.startsWith('"')) {
      out += chalk.green(word);
    } else if (segmentStart) {
      out += chalk.bold.cyan(word);
      segmentStart = false;
    } else {
      out += chalk.white(word);
    }
  }

  return out;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
