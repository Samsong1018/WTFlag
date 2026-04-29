import chalk from 'chalk';

const RULES = [
  // Recursive deletion
  {
    pattern: /\brm\b[^;|&\n]*(?:-[a-zA-Z]*r|-r[a-zA-Z]*|--recursive)/,
    level: 'danger',
    message: 'Recursive deletion — files cannot be recovered',
  },
  // git destructive ops
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    level: 'danger',
    message: 'Hard reset — discards all uncommitted changes permanently',
  },
  {
    pattern: /\bgit\s+push\b[^;|&\n]*(?:\s-f\b|\s--force\b|\s--force-with-lease\b)/,
    level: 'danger',
    message: 'Force push — rewrites remote history',
  },
  {
    pattern: /\bgit\s+clean\b[^;|&\n]*-[a-zA-Z]*f/,
    level: 'danger',
    message: 'git clean -f — permanently deletes untracked files',
  },
  // Disk-level ops
  {
    pattern: /\bdd\s+if=/,
    level: 'danger',
    message: 'Low-level disk write — can overwrite data irreversibly',
  },
  {
    pattern: /\bmkfs\b/,
    level: 'danger',
    message: 'Formats a filesystem — destroys all existing data on the target',
  },
  // Remote code execution
  {
    pattern: /\b(?:curl|wget)\b[^|]*\|\s*(?:bash|sh|zsh|fish)\b/,
    level: 'danger',
    message: 'Executing remote script — verify the source before running',
  },
  // SQL drops
  {
    pattern: /\b(?:DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE)\b/i,
    level: 'danger',
    message: 'Destructive SQL — data cannot be recovered without a backup',
  },
  // Root deletion
  {
    pattern: /\bsudo\s+rm\b/,
    level: 'danger',
    message: 'Root-level file deletion',
  },
  // chmod 777
  {
    pattern: /\bchmod\b[^;|&\n]*\b777\b/,
    level: 'danger',
    message: 'chmod 777 — grants full read/write/execute access to all users',
  },
  // Partition editors
  {
    pattern: /\b(?:fdisk|parted|gdisk)\b/,
    level: 'warning',
    message: 'Partition editor — incorrect changes can cause data loss',
  },
  // Force kill
  {
    pattern: /\bkill\s+-9\b|\bkill\s+-SIGKILL\b/,
    level: 'warning',
    message: 'SIGKILL — force-terminates the process with no cleanup',
  },
  // Truncate to zero
  {
    pattern: /\btruncate\b[^;|&\n]*(?:-s\s*0\b|--size[=\s]+0\b)/,
    level: 'warning',
    message: 'Truncates file to zero bytes — all content will be lost',
  },
];

export function checkDanger(commandString) {
  const seen = new Set();
  const results = [];
  for (const { pattern, level, message } of RULES) {
    if (pattern.test(commandString) && !seen.has(message)) {
      seen.add(message);
      results.push({ level, message });
    }
  }
  // Dangers before warnings
  return results.sort((a, b) => (a.level === 'danger' ? -1 : 1));
}

export function renderDangerLines(dangers, dim) {
  const lines = [];
  for (const { level, message } of dangers) {
    if (level === 'danger') {
      lines.push(dim('│ ') + chalk.bgRed.white.bold(' DANGER ') + '  ' + chalk.red(message));
    } else {
      lines.push(dim('│ ') + chalk.bgYellow.black.bold(' WARNING ') + ' ' + chalk.yellow(message));
    }
  }
  return lines;
}
