// Splits a shell string into discrete segments (handles pipes, &&, ;)
// then parses each segment into { command, subcommand, flags, args, raw }

export function tokenize(input) {
  return splitSegments(input).map(parseSegment).filter(Boolean);
}

// Detects I/O redirections in a raw segment string.
// Returns array of { op, fd, target } objects.
export function detectRedirects(raw) {
  // Strip quoted regions to avoid false matches inside strings
  const stripped = raw
    .replace(/'[^']*'/g, '  ')
    .replace(/"[^"]*"/g, '  ');

  const redirects = [];
  // Match 2>&1 as a single unit FIRST (before \d*> patterns can consume the '2').
  // Then fall through to numbered/plain redirects.
  const pattern = /2>&1|(\d*)(>>|>&\d*|>|<(?!<))/g;
  let m;
  while ((m = pattern.exec(stripped)) !== null) {
    if (m[0] === '2>&1') {
      redirects.push({ op: '2>&1', fd: '2', target: null });
      continue;
    }
    const fd = m[1] || null;
    const op = m[2];
    const after = stripped.slice(m.index + m[0].length).match(/^\s*(\S+)/);
    const target = after?.[1] ?? null;
    // Skip targets that look like operators themselves
    if (target && /^[><|&;]/.test(target)) continue;
    redirects.push({ op, fd, target });
  }
  return redirects;
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

// Redirect operators that should not land in args
const REDIRECT_OPS = new Set(['>', '>>', '<', '2>', '2>>', '2>&1', '&>']);

function parseSegment(segment) {
  const tokens = shellSplit(segment);
  if (!tokens.length) return null;

  const command = tokens[0];
  const flags = [];
  const args = [];
  let subcommand = null;
  let expectValue = false;
  let skipNext = false;   // used to swallow the filename after a redirect op

  for (const token of tokens.slice(1)) {
    if (skipNext) { skipNext = false; continue; }
    if (expectValue) { args.push(token); expectValue = false; continue; }

    // Strip redirect operators (and their targets) so they don't pollute args
    if (REDIRECT_OPS.has(token)) {
      if (token !== '2>&1') skipNext = true;  // 2>&1 has no separate filename
      continue;
    }

    if (token.startsWith('-')) {
      // Expand combined short flags of 2-3 chars: -am → -a -m, -lah → -l -a -h
      // Flags 4+ chars like -name, -type, -exec are GNU long options, keep whole
      if (/^-[a-zA-Z]{2,3}$/.test(token)) {
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
