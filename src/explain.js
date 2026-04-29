import chalk from 'chalk';
import { tokenize } from './tokenizer.js';
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

// Only use subcommand if the compound name exists in tldr (git-commit, npm-install, etc.)
// This prevents "grep foo" from incorrectly showing as label "grep foo"
function resolveSegment({ command, subcommand, flags, args }) {
  const compoundTldr = subcommand ? lookupCompound(command, subcommand) : null;
  const tldr = compoundTldr ?? lookupCommand(command);
  const resolvedSub = compoundTldr ? subcommand : null;

  return {
    label: resolvedSub ? `${command} ${resolvedSub}` : command,
    description: tldr?.description ?? null,
    flags: explainFlags(command, resolvedSub, flags),
    // Use original tokenizer subcommand for context (not tldr-resolved) so handlers
    // fire correctly even when the tldr DB doesn't have the compound entry
    context: getArgumentContext(command, subcommand, args, flags),
  };
}

function format(raw, results) {
  const W = 62;
  const dim = chalk.dim;
  const lines = [];

  lines.push(dim('┌') + chalk.bold.cyan(' wtflag ') + dim('─'.repeat(W - 7) + '┐'));
  lines.push(dim('│ ') + chalk.white(truncate(raw, W - 2)));
  lines.push(dim('│'));

  const dangers = checkDanger(raw);
  if (dangers.length) {
    lines.push(...renderDangerLines(dangers, dim));
    lines.push(dim('│'));
  }

  for (const { label, description, flags, context } of results) {
    const desc = description ?? dim('not in tldr database');
    lines.push(dim('│ ') + chalk.bold(label) + dim(' — ') + desc);

    if (context) {
      lines.push(dim('│   ') + chalk.dim('→ ') + chalk.dim.italic(context));
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

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
