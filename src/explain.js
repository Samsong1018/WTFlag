import { Chalk } from 'chalk';
const chalk = new Chalk({ level: 3 });
import { basename } from 'node:path';
import { tokenize, detectRedirects } from './tokenizer.js';
import { lookupCommand, lookupCompound, dbExists } from './tldr.js';
import { explainFlags } from './flags.js';
import { checkDanger, renderDangerLines } from './danger.js';
import { getArgumentContext } from './context.js';

// sudo flags that consume a following value argument (so it isn't mistaken for the real command).
// e.g. `sudo -u root rm -rf /` — `-u` takes `root` as its value, the real command is `rm`.
const SUDO_FLAGS_WITH_VALUE = new Set([
  '-u', '--user', '-g', '--group', '-p', '--prompt', '-U', '--other-user',
  '-h', '--host', '-C', '--close-from', '-T', '--command-timeout',
  '-r', '--role', '-t', '--type', '-D', '--chdir', '-R', '--chroot',
]);

// Strips a leading literal backslash (used to bypass shell aliases, e.g. `\rm`) and
// normalizes a path-qualified command (`/bin/rm`, `/usr/bin/rm`) down to its basename,
// so blocklist/mutelist lookups match regardless of how the command was invoked.
function normalizeCommandName(name) {
  if (!name) return '';
  let n = name;
  if (n.startsWith('\\')) n = n.slice(1);
  n = basename(n);
  return n.toLowerCase();
}

// Given sudo's raw token list (tokens[0] === 'sudo'), skip past sudo's own flags
// (and their values) to find the tokens that make up the real command.
function sudoRealCommandTokens(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    if (SUDO_FLAGS_WITH_VALUE.has(tokens[i])) { i += 2; continue; }
    i += 1;
  }
  return tokens.slice(i);
}

// Returns the command that should be matched against the mute/block lists.
// For `sudo grep …`, the effective command is `grep`, not `sudo`. Also resolves
// `sudo -u user …` correctly (skipping sudo's own flags) and normalizes path-qualified
// or backslash-escaped command names (`/bin/rm`, `\rm`) to their basename.
export function effectiveCommand(seg) {
  if (seg.command?.toLowerCase() === 'sudo') {
    if (Array.isArray(seg.tokens) && seg.tokens.length) {
      const real = sudoRealCommandTokens(seg.tokens);
      if (real.length) return normalizeCommandName(real[0]);
    }
    // Fallback for hand-built segments without raw tokens (e.g. unit tests)
    if (seg.subcommand) return normalizeCommandName(seg.subcommand);
    return 'sudo';
  }
  return normalizeCommandName(seg.command);
}

// --- Wrapper/indirection resolution (block-list bypass mitigation) ---
//
// Name-based blocking only checked the first token of each top-level segment, so any
// wrapper or indirection command (`bash -c "…"`, `xargs rm -rf`, `find . -exec rm -rf {} \;`,
// `nohup rm -rf …`, `env rm -rf …`, `command rm -rf …`, etc.) resolved to the wrapper's own
// name instead of the command it actually executes. This recursively unwraps known wrapper
// commands and returns every "real" command name reachable from a command string, which
// hook.js checks against the block list in addition to the top-level segment names.

const SHELL_WRAPPERS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash']);
const CODE_WRAPPERS = new Set(['python', 'python3', 'perl', 'ruby', 'node']);
const PASSTHROUGH_WRAPPERS = new Set(['nohup', 'env', 'command', 'nice', 'timeout', 'watch']);
const MAX_WRAPPER_DEPTH = 8;

// Best-effort scan for bare command-like words inside code that doesn't parse as clean
// shell syntax (e.g. the body of `python3 -c "os.system('rm -rf /tmp/x')"`). This can never
// be a full interpreter parser — it's a narrow safety net, not a substitute for one.
function extractBareWords(str) {
  return (str.match(/[A-Za-z0-9_./\\-]+/g) || []).map(normalizeCommandName);
}

// Recursively resolves a command string down to every "real" command name that could
// actually execute, seeing through sudo, shell/interpreter -c/-e wrappers, xargs,
// find -exec, and simple passthrough wrappers (nohup/env/command/nice/timeout/watch).
export function resolveRealCommands(commandString, depth = 0) {
  if (depth > MAX_WRAPPER_DEPTH || !commandString) return [];
  const segments = tokenize(commandString).filter(Boolean);
  const names = [];
  for (const seg of segments) {
    names.push(...resolveSegmentCommands(seg, depth));
  }
  return names;
}

function resolveSegmentCommands(seg, depth) {
  const tokens = Array.isArray(seg.tokens) && seg.tokens.length ? seg.tokens : [seg.command];
  const name = normalizeCommandName(tokens[0]);

  if (name === 'sudo') {
    const realTokens = sudoRealCommandTokens(tokens);
    if (!realTokens.length) return ['sudo'];
    return [name, ...resolveRealCommands(realTokens.join(' '), depth + 1)];
  }

  if (SHELL_WRAPPERS.has(name) || CODE_WRAPPERS.has(name)) {
    const flagIdx = tokens.findIndex((t, idx) => idx > 0 && (t === '-c' || t === '-e'));
    if (flagIdx !== -1 && tokens[flagIdx + 1]) {
      const wrapped = tokens[flagIdx + 1];
      const nested = resolveRealCommands(wrapped, depth + 1);
      // Fallback heuristic for embedded calls inside interpreter code (e.g. os.system('rm -rf x'))
      // that don't parse as clean shell syntax: scan bare words for known dangerous-looking names.
      const wordScan = extractBareWords(wrapped);
      return [name, ...nested, ...wordScan];
    }
    return [name];
  }

  if (name === 'xargs') {
    let i = 1;
    while (i < tokens.length && tokens[i].startsWith('-')) i++;
    if (i < tokens.length) return [name, ...resolveRealCommands(tokens.slice(i).join(' '), depth + 1)];
    return [name];
  }

  if (name === 'find') {
    const execIdx = tokens.findIndex(t => t === '-exec' || t === '-execdir');
    if (execIdx !== -1) {
      const rest = tokens.slice(execIdx + 1);
      const termIdx = rest.findIndex(t => t === ';' || t === '\\;');
      const cmdTokens = (termIdx === -1 ? rest : rest.slice(0, termIdx)).filter(t => t !== '{}');
      if (cmdTokens.length) return [name, ...resolveRealCommands(cmdTokens.join(' '), depth + 1)];
    }
    return [name];
  }

  if (PASSTHROUGH_WRAPPERS.has(name)) {
    let i = 1;
    while (i < tokens.length) {
      const t = tokens[i];
      if (name === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
      if (t.startsWith('-')) {
        const takesValue =
          (name === 'nice' && /^(-n|--adjustment)$/.test(t)) ||
          (name === 'timeout' && /^(-k|--kill-after|-s|--signal)$/.test(t));
        i += takesValue ? 2 : 1;
        continue;
      }
      break;
    }
    // timeout/nice have one numeric-ish positional argument (duration/niceness) before the real command
    if ((name === 'timeout' || name === 'nice') && i < tokens.length && /^[0-9]+[smhd]?$/i.test(tokens[i])) {
      i++;
    }
    if (i < tokens.length) return [name, ...resolveRealCommands(tokens.slice(i).join(' '), depth + 1)];
    return [name];
  }

  return [name];
}

export function renderBlocked(blockedName, rawCommand, isPattern = false) {
  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const lines = [];
  lines.push(dim('┌') + chalk.bold.red(' BLOCKED ') + dim('─'.repeat(W - 8) + '┐'));
  lines.push(dim('│ ') + chalk.bold.red(truncate(rawCommand, W - 2)));
  lines.push(dim('│'));
  if (isPattern) {
    lines.push(dim('│ ') + chalk.red(`Matches blocked pattern '${blockedName}' — Claude cannot run this command.`));
    lines.push(dim('│ ') + chalk.dim(`Run \`wtflag unblock "${blockedName}"\` to allow it.`));
  } else {
    lines.push(dim('│ ') + chalk.red(`'${blockedName}' is on your block list — Claude cannot run this command.`));
    lines.push(dim('│ ') + chalk.dim(`Run \`wtflag unblock ${blockedName}\` to allow it.`));
  }
  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}

// Rendered when the config on disk failed to load (corrupt JSON, unreadable file, etc.).
// Uses the same loud box treatment as BLOCKED so a broken config is never a silent, dim
// stderr line — wtflag fails closed here by falling back to the built-in 'safe' profile
// rather than an empty ruleset, but the user needs to know their custom block/mute list
// is not in effect until the config is repaired.
export function renderConfigError(message, rawCommand) {
  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const lines = [];
  lines.push(dim('┌') + chalk.bold.red(' CONFIG ERROR ') + dim('─'.repeat(W - 13) + '┐'));
  if (rawCommand) lines.push(dim('│ ') + chalk.bold.red(truncate(rawCommand, W - 2)));
  lines.push(dim('│'));
  lines.push(dim('│ ') + chalk.red(truncate(message, W - 2)));
  lines.push(dim('│ ') + chalk.red(`wtflag cannot load your custom block/mute list — falling back to the`));
  lines.push(dim('│ ') + chalk.red(`built-in 'safe' profile until this is fixed.`));
  lines.push(dim('│ ') + chalk.dim('Fix or delete the config file, then re-run this command.'));
  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}

export function explain(commandString, { mutelist } = {}) {
  const segments = tokenize(commandString)
    .filter(Boolean)
    .filter(seg => !mutelist?.has(effectiveCommand(seg)));
  if (!segments.length) return null;

  const results = segments.map(resolveSegment);
  return format(commandString, results);
}

function resolveSegment({ command, subcommand, flags, args, raw, tokens }) {
  // sudo transparency: look up the real command instead of sudo itself.
  // Skip past sudo's own flags (`-u user`, `-i`, `-n`, `-E`, …) first — otherwise
  // `sudo -u root rm -rf /` would incorrectly resolve to `root` instead of `rm`.
  if (command === 'sudo') {
    let realCmd = subcommand;
    let realFlags = flags;
    let realArgs = args;
    let realSubFromTokens = null;

    if (Array.isArray(tokens) && tokens.length) {
      const realTokens = sudoRealCommandTokens(tokens);
      if (realTokens.length) {
        const rebuilt = tokenize(realTokens.join(' '))[0];
        if (rebuilt) {
          realCmd = rebuilt.command;
          realFlags = rebuilt.flags;
          realArgs = rebuilt.args;
          realSubFromTokens = rebuilt.subcommand;
        }
      }
    }

    // Fall through to normal resolution (describing `sudo` itself) only when no real
    // command could be resolved at all — e.g. bare `sudo` with nothing following it.
    if (realCmd) {
      // args[0] may be the subcommand of the real command (e.g. "git commit" → args[0]="commit")
      const realSub = realSubFromTokens ?? (realArgs[0] && /^[a-z][a-z0-9_-]*$/i.test(realArgs[0]) ? realArgs[0] : null);
      const realArgsRest = (!realSubFromTokens && realSub) ? realArgs.slice(1) : realArgs;

      const compoundTldr = realSub ? lookupCompound(realCmd, realSub) : null;
      const tldr = compoundTldr ?? lookupCommand(realCmd);
      const resolvedSub = compoundTldr ? realSub : null;

      return {
        label: resolvedSub ? `sudo ${realCmd} ${resolvedSub}` : `sudo ${realCmd}`,
        description: tldr?.description ?? null,
        flags: explainFlags(realCmd, resolvedSub, realFlags),
        context: getArgumentContext(realCmd, realSub, realArgsRest, realFlags),
        redirects: detectRedirects(raw),
        isSudo: true,
      };
    }
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
