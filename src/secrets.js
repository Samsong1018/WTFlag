import { execSync } from 'node:child_process';
import { Chalk } from 'chalk';

const chalk = new Chalk({ level: 3 });

const PATTERNS = [
  { name: 'AWS Access Key ID',           re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS Secret Access Key',       re: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/i },
  { name: 'GitHub Personal Access Token', re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{59}/ },
  { name: 'Anthropic API Key',           re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
  { name: 'OpenAI API Key',              re: /\bsk-(?!ant)[a-zA-Z0-9]{32,}\b/ },
  { name: 'Stripe Secret Key',           re: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'Stripe Restricted Key',       re: /\brk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'SendGrid API Key',            re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { name: 'Slack Token',                 re: /\bxox[bpoa]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'Slack Webhook URL',           re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_]+\/B[A-Za-z0-9_]+\/[A-Za-z0-9_]+/ },
  { name: 'Database URL with credentials', re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|rabbitmq):\/\/[^:@\s]+:[^@\s]{6,}@/ },
  { name: 'Private key',                 re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Generic API key',             re: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9_.\\-]{20,}['"]/i },
  { name: 'Secret or token assignment',  re: /(?<![a-zA-Z0-9_])(?:secret|private_key)\s*[=:]\s*['"][A-Za-z0-9_.\\-]{20,}['"]/i },
  { name: 'Password assignment',         re: /(?<![a-zA-Z0-9_])(?:password|passwd)\s*[=:]\s*['"][^'"]{8,}['"]/i },
];

const SKIP_FILENAMES = new Set([
  '.env.example', '.env.sample', '.env.template', '.env.test', '.env.ci',
]);

// Directory segments that indicate test/fixture content
const SKIP_DIR_SEGMENTS = new Set([
  'test', 'tests', 'spec', 'specs', '__tests__', '__mocks__', 'fixtures', '__fixtures__', 'mocks',
]);

function isSkipped(filename) {
  if (!filename) return false;
  const parts = filename.split('/');
  const base = parts[parts.length - 1];
  if (SKIP_FILENAMES.has(base)) return true;
  if (/\.lock$/.test(base)) return true;
  // Skip test files by name pattern
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) return true;
  // Skip files inside test/spec/fixture directories
  if (parts.some(p => SKIP_DIR_SEGMENTS.has(p.toLowerCase()))) return true;
  return false;
}

function redact(value) {
  if (value.length <= 8) return '***';
  return value.slice(0, 6) + '***';
}

export function parseDiff(diffText) {
  const findings = [];
  let file = null;
  let lineNum = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6).trim();
      lineNum = 0;
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNum = parseInt(hunk[1], 10) - 1;
      continue;
    }

    if (line.startsWith('+')) {
      lineNum++;
      if (isSkipped(file)) continue;
      const content = line.slice(1);
      for (const { name, re } of PATTERNS) {
        const m = re.exec(content);
        if (m) {
          findings.push({ file, line: lineNum, type: name, redacted: redact(m[0]) });
          break;
        }
      }
    } else if (!line.startsWith('-')) {
      lineNum++;
    }
  }

  return findings;
}

function runGit(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

export function isGitCommit(cmd) {
  return /\bgit\s+commit\b/.test(cmd);
}

export function isGitPush(cmd) {
  return /\bgit\s+push\b/.test(cmd);
}

export function scanForSecrets(command, cwd) {
  try {
    let diff = '';
    if (isGitCommit(command)) {
      diff = runGit('diff --cached', cwd);
    } else if (isGitPush(command)) {
      diff = runGit('log @{u}..HEAD -p --no-merges', cwd);
      if (!diff.trim()) {
        // No tracked upstream — try origin/HEAD
        diff = runGit('log origin/HEAD..HEAD -p --no-merges', cwd);
      }
    }
    return diff ? parseDiff(diff) : [];
  } catch {
    return [];
  }
}

export function renderSecretsBlocked(findings) {
  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const label = ' SECRETS DETECTED — PUSH BLOCKED ';
  const lines = [];
  lines.push(dim('┌') + chalk.bgRed.white.bold(label) + dim('─'.repeat(W + 1 - label.length) + '┐'));
  lines.push(dim('│ ') + chalk.red.bold(`${findings.length} potential secret${findings.length !== 1 ? 's' : ''} found in commits — push blocked`));
  lines.push(dim('│'));
  for (const { file, line, type, redacted } of findings) {
    lines.push(dim('│ ') + chalk.red('✖ ') + chalk.bold(type));
    if (file) lines.push(dim('│   ') + chalk.dim(`${file}:${line}`) + chalk.dim(` (${redacted}…)`));
  }
  lines.push(dim('│'));
  lines.push(dim('│ ') + chalk.dim('Move secrets to environment variables or a secrets manager.'));
  lines.push(dim('│ ') + chalk.dim('To rewrite history: git rebase -i, or use BFG Repo Cleaner.'));
  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}

export function renderSecretsWarning(findings) {
  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const label = ' SECRET SCAN ';
  const lines = [];
  lines.push(dim('┌') + chalk.bgYellow.black.bold(label) + dim('─'.repeat(W + 1 - label.length) + '┐'));
  lines.push(dim('│ ') + chalk.yellow.bold(`${findings.length} potential secret${findings.length !== 1 ? 's' : ''} found in staged changes`));
  lines.push(dim('│'));
  for (const { file, line, type, redacted } of findings) {
    lines.push(dim('│ ') + chalk.yellow('⚠ ') + chalk.bold(type));
    if (file) lines.push(dim('│   ') + chalk.dim(`${file}:${line}`) + chalk.dim(` (${redacted}…)`));
  }
  lines.push(dim('│'));
  lines.push(dim('│ ') + chalk.dim('Commit will proceed. Remove secrets before pushing to a remote.'));
  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}
