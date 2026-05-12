import { Chalk } from 'chalk';
const chalk = new Chalk({ level: 3 });
import { checkDanger } from './danger.js';

function parseDiff(text) {
  const files = [];
  let current = null;

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { file: null, added: [], removed: [], isNew: false, isDeleted: false, binary: false };
      files.push(current);
    } else if (current) {
      if (line.startsWith('new file mode')) {
        current.isNew = true;
      } else if (line.startsWith('deleted file mode')) {
        current.isDeleted = true;
      } else if (line.startsWith('Binary files')) {
        current.binary = true;
      } else if (line.startsWith('+++ ')) {
        const path = line.slice(4).replace(/^b\//, '');
        current.file = path === '/dev/null' ? null : path;
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        current.added.push(line.slice(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        current.removed.push(line.slice(1));
      }
    }
  }

  return files.filter(f => f.file || f.binary);
}

function fileType(path) {
  if (!path) return 'binary';
  const lower = path.toLowerCase();
  const ext = lower.split('.').pop();
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return 'shell script';
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env'].includes(ext)) return 'config';
  if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) return 'JavaScript';
  if (['py'].includes(ext)) return 'Python';
  if (['go'].includes(ext)) return 'Go';
  if (['rs'].includes(ext)) return 'Rust';
  if (['rb'].includes(ext)) return 'Ruby';
  if (['java', 'kt'].includes(ext)) return 'JVM';
  if (['c', 'cpp', 'h', 'hpp'].includes(ext)) return 'C/C++';
  if (['md', 'mdx', 'txt', 'rst'].includes(ext)) return 'docs';
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'Dockerfile';
  if (lower === 'makefile' || lower.endsWith('/makefile')) return 'Makefile';
  if (lower.endsWith('package.json') || lower.endsWith('cargo.toml') || lower.endsWith('go.mod')) return 'manifest';
  return 'source';
}

export function explainDiff(diffText) {
  const files = parseDiff(diffText.trim());
  if (!files.length) return null;

  const W = Math.max(Math.min((process.stdout.columns ?? 80) - 4, 110), 58);
  const dim = chalk.dim;
  const lines = [];

  const totalAdded = files.reduce((n, f) => n + f.added.length, 0);
  const totalRemoved = files.reduce((n, f) => n + f.removed.length, 0);
  const newCount = files.filter(f => f.isNew).length;
  const deletedCount = files.filter(f => f.isDeleted).length;
  const modifiedCount = files.length - newCount - deletedCount;

  lines.push(dim('┌') + chalk.bold.cyan(' wtflag diff ') + dim('─'.repeat(W - 12) + '┐'));

  const parts = [];
  if (modifiedCount) parts.push(`${modifiedCount} modified`);
  if (newCount)      parts.push(`${newCount} added`);
  if (deletedCount)  parts.push(`${deletedCount} deleted`);
  lines.push(
    dim('│ ') +
    chalk.bold(`${files.length} file${files.length !== 1 ? 's' : ''} changed`) +
    chalk.dim(` (${parts.join(', ')})`) +
    '  ' + chalk.green(`+${totalAdded}`) + ' ' + chalk.red(`-${totalRemoved}`)
  );
  lines.push(dim('│'));

  // Per-file summary
  const maxLen = Math.min(50, Math.max(...files.map(f => (f.file ?? '(binary)').length)));
  for (const f of files) {
    const name = (f.file ?? '(binary)').padEnd(maxLen);
    const stats = f.binary
      ? chalk.dim('binary file')
      : (chalk.green(`+${f.added.length}`) + ' ' + chalk.red(`-${f.removed.length}`)).padEnd(14);
    const status = f.isNew
      ? chalk.green('new     ')
      : f.isDeleted
        ? chalk.red('deleted ')
        : chalk.dim('modified');
    const type = chalk.dim(fileType(f.file));
    lines.push(dim('│  ') + chalk.cyan('●') + ' ' + chalk.white(name) + '  ' + stats + '  ' + status + '  ' + type);
  }

  // Danger detection — scan added lines per file
  const dangersByFile = [];
  for (const f of files) {
    if (!f.added.length) continue;
    const dangers = checkDanger(f.added.join('\n'));
    if (dangers.length) dangersByFile.push({ file: f.file, dangers });
  }

  if (dangersByFile.length) {
    lines.push(dim('│'));
    for (const { file, dangers } of dangersByFile) {
      lines.push(dim('│ ') + chalk.bold.yellow(`⚑ Dangers introduced in ${file ?? '(binary)'}:`));
      for (const { level, message } of dangers) {
        if (level === 'danger') {
          lines.push(dim('│   ') + chalk.bgRed.white.bold(' DANGER ') + '  ' + chalk.red(message));
        } else {
          lines.push(dim('│   ') + chalk.bgYellow.black.bold(' WARNING ') + ' ' + chalk.yellow(message));
        }
      }
    }
  }

  lines.push(dim('└' + '─'.repeat(W + 1) + '┘'));
  return lines.join('\n');
}
