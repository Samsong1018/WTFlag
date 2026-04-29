import chalk from 'chalk';
import { tokenize } from './tokenizer.js';
import { lookupCommand, dbExists } from './tldr.js';
import { explainFlags } from './flags.js';

export function explain(commandString) {
  const segments = tokenize(commandString).filter(Boolean);
  if (!segments.length) return null;

  const results = segments.map(({ command, subcommand, flags }) => ({
    label: subcommand ? `${command} ${subcommand}` : command,
    tldr: lookupCommand(command, subcommand),
    flags: explainFlags(command, subcommand, flags),
  }));

  return format(commandString, results);
}

function format(raw, results) {
  const W = 62;
  const dim = chalk.dim;
  const lines = [];

  lines.push(dim('┌') + chalk.bold.cyan(' shellexplainer ') + dim('─'.repeat(W - 17) + '┐'));
  lines.push(dim('│ ') + chalk.white(truncate(raw, W - 2)));
  lines.push(dim('│'));

  for (const { label, tldr, flags } of results) {
    const desc = tldr?.description ?? dim('not in tldr database');
    lines.push(dim('│ ') + chalk.bold(label) + dim(' — ') + desc);

    if (flags.length) {
      lines.push(dim('│'));
      for (const { flag, description } of flags) {
        lines.push(dim('│   ') + chalk.yellow(flag.padEnd(14)) + description);
      }
    }

    if (results.length > 1) lines.push(dim('│'));
  }

  if (!dbExists()) {
    lines.push(dim('│'));
    lines.push(dim('│  ') + chalk.dim('Run `shellexplainer update-db` to enable full descriptions.'));
  }

  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
