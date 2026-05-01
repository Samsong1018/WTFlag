import { Chalk } from 'chalk';
const chalk = new Chalk({ level: 3 });

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
  // Deleting root filesystem
  {
    pattern: /\brm\b[^;|&\n]*-[a-zA-Z]*r[a-zA-Z]*[^;|&\n]*\s+\/\s*$|\brm\b[^;|&\n]*-[a-zA-Z]*r[a-zA-Z]*[^;|&\n]*\s+\/\*/,
    level: 'danger',
    message: 'rm -rf / — will delete the entire filesystem',
  },
  // Recursive chmod 777
  {
    pattern: /\bchmod\b[^;|&\n]*-[Rr][^;|&\n]*\b777\b|\bchmod\b[^;|&\n]*\b777\b[^;|&\n]*-[Rr]/,
    level: 'danger',
    message: 'chmod -R 777 — recursively exposes entire directory tree to all users',
  },
  // Direct disk device write
  {
    pattern: />\s*\/dev\/(?:sd[a-z]|nvme\d|hd[a-z]|vd[a-z]|xvd[a-z]|disk\d)/,
    level: 'danger',
    message: 'Writing directly to a disk device — destroys partition data irreversibly',
  },
  // iptables flush
  {
    pattern: /\biptables\b[^;|&\n]*\s-F\b/,
    level: 'warning',
    message: 'iptables -F — flushes all firewall rules, exposing the system',
  },
  // Fork bomb
  {
    pattern: /:\s*\(\s*\)\s*\{.*:\s*\|.*:.*\}/,
    level: 'danger',
    message: 'Fork bomb — will exhaust system resources and crash the machine',
  },
  // userdel -r (removes home dir)
  {
    pattern: /\buserdel\b[^;|&\n]*-[a-zA-Z]*r/,
    level: 'danger',
    message: 'userdel -r — permanently deletes the user account and home directory',
  },
  // nohup with destructive commands (run destructive command immune to hangups)
  {
    pattern: /\bnohup\b[^;|&\n]*\brm\b[^;|&\n]*-[a-zA-Z]*r/,
    level: 'danger',
    message: 'Background recursive deletion — will continue even if terminal closes',
  },
  // Windows: recursive deletion (PowerShell Remove-Item -Recurse / ri -r)
  {
    pattern: /\bRemove-Item\b[^;|&\n]*-(?:Recurse|r\b)|\bri\b[^;|&\n]*-(?:Recurse|r\b)/i,
    level: 'danger',
    message: 'Recursive deletion (PowerShell) — files cannot be recovered',
  },
  // Windows: recursive cmd.exe deletion
  {
    pattern: /\b(?:rd|rmdir)\b[^;|&\n]*\/[Ss]/,
    level: 'danger',
    message: 'Recursive directory removal — cannot be undone',
  },
  {
    pattern: /\bdel\b[^;|&\n]*\/[Ss]/i,
    level: 'danger',
    message: 'Recursive file deletion (del /s) — files cannot be recovered',
  },
  // Windows: disk formatting
  {
    pattern: /\bFormat-Volume\b|\bformat\s+[A-Za-z]:\b/i,
    level: 'danger',
    message: 'Disk format — destroys all data on the target volume',
  },
  // Windows: grant everyone full control (icacls equivalent of chmod 777)
  {
    pattern: /\bicacls\b[^;|&\n]*[Ee]veryone[^;|&\n]*:[FfCc]/,
    level: 'danger',
    message: 'icacls grants Everyone full control — exposes files to all users',
  },
  // Windows: registry deletion
  {
    pattern: /\breg\s+delete\b/i,
    level: 'danger',
    message: 'Registry deletion — can break Windows components permanently',
  },
  // Windows: remote script execution via PowerShell (equivalent of curl | bash)
  {
    pattern: /\bInvoke-Expression\b[^;|&\n]*\bInvoke-WebRequest\b|\biex\b[^;|&\n]*\biwr\b|\bInvoke-Expression\b[^;|&\n]*\(.*http/i,
    level: 'danger',
    message: 'Executing remote script (PowerShell) — verify the source before running',
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
  return results.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));
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
