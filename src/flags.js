import { execSync } from 'node:child_process';

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

  const cmd = subcommand ? `${command} ${subcommand} --help` : `${command} --help`;
  let text = '';
  try {
    text = execSync(`${cmd} 2>&1`, { timeout: 3000, encoding: 'utf8' });
  } catch (e) {
    text = e.stdout ?? '';
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
    if (!line.includes(cleanFlag)) continue;

    // Pattern: "  -a, --all          description"
    const inline = line.match(/^\s+(?:-[^\s,]+(?:,\s*--[^\s=]+)?|--[^\s=]+)[=\s][^\s-].*?\s{2,}(.+)/);
    if (inline) return inline[1].trim();

    // Pattern: "  -f    description" or "  --flag  description"
    const simple = line.match(/^\s+(?:-[^\s,]+|--[^\s=]+)\s{2,}(.+)/);
    if (simple && line.includes(cleanFlag)) return simple[1].trim();

    // Description on the next line
    const flagOnly = line.match(/^\s+((?:-[^\s,]+|--[^\s=]+))\s*$/);
    if (flagOnly && flagOnly[1].includes(cleanFlag)) {
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('-')) return next;
    }
  }

  return null;
}
