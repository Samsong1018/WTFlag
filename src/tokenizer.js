// Splits a shell string into discrete segments (handles pipes, &&, ;)
// then parses each segment into { command, subcommand, flags, args, raw }

export function tokenize(input) {
  return splitSegments(input).map(parseSegment).filter(Boolean);
}

function splitSegments(input) {
  const segments = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }

    if (!inSingle && !inDouble) {
      // Split on |, ;, &&, ||
      if ((ch === '&' && input[i + 1] === '&') || (ch === '|' && input[i + 1] === '|')) {
        i++;
        if (current.trim()) segments.push(current.trim());
        current = '';
        continue;
      }
      if (ch === '|' || ch === ';') {
        if (current.trim()) segments.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function parseSegment(segment) {
  const tokens = shellSplit(segment);
  if (!tokens.length) return null;

  const command = tokens[0];
  const flags = [];
  const args = [];
  let subcommand = null;
  let expectValue = false;

  for (const token of tokens.slice(1)) {
    if (expectValue) { args.push(token); expectValue = false; continue; }

    if (token.startsWith('-')) {
      // Expand combined short flags: -am → -a -m (skip long flags and --)
      if (/^-[a-zA-Z]{2,}$/.test(token)) {
        for (const ch of token.slice(1)) flags.push(`-${ch}`);
      } else {
        flags.push(token);
      }
      // Flags like -o that typically take a value (heuristic: short flag, no =)
      if (/^-[a-zA-Z]$/.test(token)) expectValue = false; // can't know without help text
    } else if (!subcommand && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) {
      subcommand = token;
    } else {
      args.push(token);
    }
  }

  return { command, subcommand, flags, args, raw: segment };
}

function shellSplit(str) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (const ch of str) {
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}
