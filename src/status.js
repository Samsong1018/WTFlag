import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { SOCKET_PATH, isWindows, HOOK_COMMAND, HOOK_COMMAND_LEGACY } from './platform.js';
import { getMutelist, getBlocklist, getBlockPatterns } from './config.js';
import { readLog, LOG_PATH } from './log.js';
import { dbExists } from './tldr.js';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

function isHookInstalled() {
  if (!existsSync(SETTINGS_PATH)) return false;
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    return settings.hooks?.PreToolUse?.some(
      h => Array.isArray(h.hooks) && h.hooks.some(
        e => e.command === HOOK_COMMAND || e.command === HOOK_COMMAND_LEGACY
      )
    ) ?? false;
  } catch {
    return false;
  }
}

export function showStatus() {
  const hookInstalled = isHookInstalled();
  // Named pipes on Windows can't be probed with existsSync; skip watcher check there.
  const watcherRunning = isWindows ? null : existsSync(SOCKET_PATH);
  const mutelist = getMutelist();
  const blocklist = getBlocklist();
  const blockPatterns = getBlockPatterns();
  const dbReady = dbExists();

  const log = readLog();
  const totalCmds = log.length;
  const blockedCmds = log.filter(e => e.blocked).length;
  const dangerCmds  = log.filter(e => e.dangerLevel === 'danger').length;
  const warnCmds    = log.filter(e => e.dangerLevel === 'warning').length;

  const ok   = chalk.green('✓');
  const warn = chalk.yellow('!');
  const no   = chalk.red('✗');
  const off  = chalk.dim('○');

  const lines = [];
  lines.push(chalk.bold('wtflag status'));
  lines.push('');

  // --- Setup ---
  lines.push(chalk.dim('  Setup'));
  lines.push(`    ${hookInstalled ? ok : no}  Hook       ${hookInstalled
    ? chalk.green('installed')
    : chalk.red('not installed') + chalk.dim(' — run `wtflag install`')}`);

  if (watcherRunning !== null) {
    lines.push(`    ${watcherRunning ? ok : off}  Watcher    ${watcherRunning
      ? chalk.green('running')
      : chalk.dim('not running — `wtflag watch` in a split pane')}`);
  }

  lines.push(`    ${dbReady ? ok : warn}  tldr DB    ${dbReady
    ? chalk.green('ready')
    : chalk.yellow('missing') + chalk.dim(' — run `wtflag update-db`')}`);

  lines.push('');

  // --- Config ---
  lines.push(chalk.dim('  Config'));
  lines.push(`         Muted    ${mutelist.size
    ? chalk.white([...mutelist].sort().join(', '))
    : chalk.dim('none')}`);
  lines.push(`         Blocked  ${blocklist.size
    ? chalk.white([...blocklist].sort().join(', '))
    : chalk.dim('none')}`);
  lines.push(`         Patterns ${blockPatterns.length
    ? chalk.white(blockPatterns.join(', '))
    : chalk.dim('none')}`);

  lines.push('');

  // --- Audit log ---
  const logLabel = chalk.dim('  Audit log') +
    (totalCmds ? chalk.dim(` — ${totalCmds} command${totalCmds === 1 ? '' : 's'}`) : '');
  lines.push(logLabel);

  if (!totalCmds) {
    lines.push(`         ${chalk.dim('No commands logged yet')}`);
  } else {
    if (blockedCmds) lines.push(`    ${warn}  Blocked   ${chalk.yellow(blockedCmds)}`);
    if (dangerCmds)  lines.push(`    ${no}  Danger    ${chalk.red(dangerCmds)}`);
    if (warnCmds)    lines.push(`    ${warn}  Warnings  ${chalk.yellow(warnCmds)}`);
    if (!blockedCmds && !dangerCmds && !warnCmds) {
      lines.push(`    ${ok}  No blocked or flagged commands`);
    }
    lines.push(`         ${chalk.dim(LOG_PATH)}`);
  }

  lines.push('');
  console.log(lines.join('\n'));
}
