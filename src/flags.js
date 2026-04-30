import { spawnSync } from 'node:child_process';
import { isWindows } from './platform.js';

// In-process cache so repeated commands in a session don't re-spawn subprocesses
const helpCache = new Map();

export function explainFlags(command, subcommand, flags) {
  if (!flags.length) return [];

  const helpText = getHelpText(command, subcommand);
  if (!helpText) return [];

  return flags
    .map(flag => ({ flag, description: matchFlag(flag, helpText) }))
    .filter(f => f.description);
}

function getHelpText(command, subcommand) {
  const key = subcommand ? `${command} ${subcommand}` : command;
  if (helpCache.has(key)) return helpCache.get(key);

  const args = subcommand ? [subcommand, '--help'] : ['--help'];
  let text = '';
  try {
    const result = spawnSync(command, args, { timeout: 3000, encoding: 'utf8' });
    text = (result.stdout ?? '') + (result.stderr ?? '');
  } catch {
    text = '';
  }

  // On Windows, fall back to /? for native commands that don't understand --help
  if (isWindows && !text.trim()) {
    try {
      const helpArgs = subcommand ? [subcommand, '/?'] : ['/?'];
      const result = spawnSync(command, helpArgs, { timeout: 3000, encoding: 'utf8', shell: true });
      text = (result.stdout ?? '') + (result.stderr ?? '');
    } catch {
      text = '';
    }
  }

  helpCache.set(key, text);
  return text;
}

function matchFlag(flag, helpText) {
  // Strip value from long flags: --output=file → --output
  const cleanFlag = flag.replace(/=.*$/, '');
  const lines = helpText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Matches "  -f[, --flag[=VAL]]    description" and "  --flag[=VAL]    description"
    // Captures the flag token(s) separately from the description so we don't
    // accidentally match lines where cleanFlag appears only in the description text.
    const flagLine = line.match(
      /^\s+(-[^\s,=]+(?:,\s*--[^\s=]+(?:=\S+)?)?|--[^\s=]+(?:=\S+)?)\s{2,}(.+)/
    );
    if (flagLine) {
      const tokens = flagLine[1].split(/[\s,]+/).map(t => t.replace(/=.*$/, ''));
      if (tokens.includes(cleanFlag)) {
        // Grab the first-line description, then append wrapped continuation lines.
        // A continuation line is indented more than the flag column and doesn't
        // start with a new flag.
        let desc = flagLine[2].trim();
        const indent = line.match(/^\s*/)[0].length;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const next = lines[j];
          const nextIndent = next.match(/^\s*/)[0].length;
          const nextTrim = next.trim();
          if (!nextTrim || nextTrim.startsWith('-') || nextIndent <= indent) break;
          desc += ' ' + nextTrim;
        }
        return desc.trim();
      }
      continue;
    }

    // Description on the next line: "  -a, --all\n      description"
    // Detect a flag-only line by: starts with '-' after trimming and has no double-space separator
    const trimmed = line.trimStart();
    if (trimmed.startsWith('-') && !/\s{2,}/.test(trimmed)) {
      const tokens = trimmed.split(/[\s,]+/)
        .map(t => t.replace(/=.*$/, '').replace(/<.*$/, ''))
        .filter(t => t.startsWith('-'));
      if (tokens.includes(cleanFlag)) {
        const next = lines[i + 1]?.trim();
        if (next && !next.startsWith('-')) return next;
      }
    }
  }

  return null;
}
