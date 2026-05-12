#!/usr/bin/env node
import { program } from 'commander';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { version } = createRequire(import.meta.url)('../package.json');
import { install, uninstall, installSoundHooks, uninstallSoundHooks, isSoundHookInstalled } from '../src/installer.js';
import { explain } from '../src/explain.js';
import { runHook } from '../src/hook.js';
import { startWatcher } from '../src/watcher.js';
import { buildDb } from '../scripts/build-db.js';
import {
  addToMutelist, removeFromMutelist, listMutelist,
  addToBlocklist, removeFromBlocklist, listBlocklist,
  addBlockPattern, removeBlockPattern, listBlockPatterns,
  setMutelist, setBlocklist, setBlockPatterns,
  isSoundEnabled, setSoundEnabled,
} from '../src/config.js';
import { allowCommand, disallowCommand, allowAll, disallowAll, listAllowed } from '../src/allow.js';
import { readLog, clearLog, LOG_PATH } from '../src/log.js';
import { playSound } from '../src/sound.js';
import { getProfile, saveProfile, deleteProfile, listProfiles, BUILTIN } from '../src/profiles.js';
import { findProjectConfig } from '../src/project-config.js';
import { showStatus } from '../src/status.js';
import { explainDiff } from '../src/diff.js';
import { generateReport } from '../src/report.js';
import { checkDanger, listCustomRules, addCustomRule, removeCustomRule } from '../src/danger.js';

program
  .name('wtflag')
  .description('Explains shell commands run by Claude Code')
  .version(version);

// --- Status ---

program
  .command('status')
  .description('Show hook state, watcher, config summary, and log stats')
  .action(showStatus);

// --- Setup ---

program
  .command('install')
  .description('Register the PreToolUse hook with Claude Code')
  .action(install);

program
  .command('uninstall')
  .description('Remove the hook from Claude Code')
  .action(uninstall);

program
  .command('update-db')
  .description('Download and rebuild the tldr-pages database')
  .action(buildDb);

// --- Explanations ---

program
  .command('explain <command>')
  .description('Explain a shell command manually')
  .action((cmd) => {
    const output = explain(cmd);
    console.log(output ?? 'No explanation found.');
  });

program
  .command('hook')
  .description('Hook entrypoint — reads Bash tool JSON from stdin')
  .option('--dry-run', 'explain commands but block all execution (preview mode)')
  .action((opts) => runHook({ dryRun: opts.dryRun }));

program
  .command('watch')
  .description('Open the watcher terminal — explanations stream here as Claude works')
  .action(startWatcher);

// --- Muting ---

program
  .command('mute <command>')
  .description('Suppress explanations for a command (e.g. grep, find)')
  .action((cmd) => {
    const normalized = addToMutelist(cmd);
    console.log(`✓ '${normalized}' muted — explanations will be skipped.`);
  });

program
  .command('unmute <command>')
  .description('Re-enable explanations for a muted command')
  .action((cmd) => {
    const removed = removeFromMutelist(cmd);
    if (removed) {
      console.log(`✓ '${cmd.toLowerCase().trim()}' unmuted.`);
    } else {
      console.log(`'${cmd.toLowerCase().trim()}' was not in the mute list.`);
    }
  });

program
  .command('mutelist')
  .description('Show all muted commands')
  .action(() => {
    const entries = listMutelist();
    if (!entries.length) {
      console.log('Mute list is empty. Use `wtflag mute <command>` to add commands.');
    } else {
      console.log('Muted commands (explanations suppressed):');
      for (const cmd of entries) console.log(`  ${cmd}`);
    }
  });

// --- Blocking ---
// If the argument contains a space or *, it's treated as a pattern.
// Otherwise it's a command name.

program
  .command('block <input>')
  .description('Block a command name (e.g. rm) or a pattern (e.g. "rm -rf")')
  .action((input) => {
    if (input.includes(' ') || input.includes('*')) {
      addBlockPattern(input);
      console.log(`✓ Pattern '${input}' blocked — Claude cannot run commands matching this.`);
    } else {
      const normalized = addToBlocklist(input);
      console.log(`✓ '${normalized}' blocked — Claude cannot run this command.`);
    }
  });

program
  .command('unblock <input>')
  .description('Remove a blocked command name or pattern')
  .action((input) => {
    if (input.includes(' ') || input.includes('*')) {
      const removed = removeBlockPattern(input);
      if (removed) {
        console.log(`✓ Pattern '${input}' unblocked.`);
      } else {
        console.log(`Pattern '${input}' was not in the block list.`);
      }
    } else {
      const removed = removeFromBlocklist(input);
      if (removed) {
        console.log(`✓ '${input.toLowerCase().trim()}' unblocked.`);
      } else {
        console.log(`'${input.toLowerCase().trim()}' was not in the block list.`);
      }
    }
  });

program
  .command('blocked')
  .description('Show all blocked commands and patterns')
  .action(() => {
    const cmds = listBlocklist();
    const patterns = listBlockPatterns();
    if (!cmds.length && !patterns.length) {
      console.log('Block list is empty. Use `wtflag block <command>` to add commands.');
      return;
    }
    if (cmds.length) {
      console.log('Blocked commands:');
      for (const cmd of cmds) console.log(`  ${cmd}`);
    }
    if (patterns.length) {
      if (cmds.length) console.log('');
      console.log('Blocked patterns:');
      for (const p of patterns) console.log(`  ${p}`);
    }
  });

// --- Auto-accept ---

program
  .command('allow <command>')
  .description('Auto-accept a command without a permission prompt (e.g. git, npm)')
  .action((cmd) => {
    const entry = allowCommand(cmd);
    console.log(`✓ '${cmd.toLowerCase().trim()}' auto-accepted — no permission prompt.`);
    console.log(`  Added to allowedTools: ${entry}`);
    console.log(`  Note: blocked commands still take precedence.`);
  });

program
  .command('disallow <command>')
  .description('Remove auto-accept for a command (permission prompt will return)')
  .action((cmd) => {
    const removed = disallowCommand(cmd);
    if (removed) {
      console.log(`✓ '${cmd.toLowerCase().trim()}' removed from auto-accept.`);
    } else {
      console.log(`'${cmd.toLowerCase().trim()}' was not in the auto-accept list.`);
    }
  });

program
  .command('allow-all')
  .description('Auto-accept ALL Bash commands and suppress safety confirmation prompts')
  .action(() => {
    const added = allowAll();
    if (added) {
      console.log('✓ All Bash commands auto-accepted — no permission prompts.');
      console.log('');
      console.log('  Note: This modifies ~/.claude/settings.json and ~/.claude/CLAUDE.md');
      console.log('        and affects ALL Claude Code sessions globally, not just this project.');
      console.log('  Note: Commands on your block list are still prevented.');
      console.log('  Run `wtflag disallow-all` to revert both changes.');
    } else {
      console.log('✓ allowedTools already set — CLAUDE.md autonomy section updated.');
      console.log('  Note: Affects ALL Claude Code sessions globally.');
    }
  });

program
  .command('disallow-all')
  .description('Remove allow-all and autonomy settings (permission prompts will return)')
  .action(() => {
    const removed = disallowAll();
    if (removed) {
      console.log('✓ Allow-all removed — permission prompts will return for Bash commands.');
      console.log('✓ Autonomy section removed from ~/.claude/CLAUDE.md.');
    } else {
      console.log('✓ Autonomy section removed from ~/.claude/CLAUDE.md.');
    }
  });

program
  .command('allowed')
  .description('Show all auto-accepted commands')
  .action(() => {
    const entries = listAllowed();
    if (!entries.length) {
      console.log('No auto-accepted commands. Use `wtflag allow <command>` or `wtflag allow-all`.');
    } else {
      console.log('Auto-accepted (no permission prompt):');
      for (const entry of entries) {
        if (entry === 'Bash') {
          console.log('  ALL Bash commands');
        } else {
          const cmd = entry.replace(/^Bash\(command:(.+?)\*\)$/, '$1');
          console.log(`  ${cmd}`);
        }
      }
    }
  });

// --- Audit log ---

program
  .command('log')
  .description('View the command audit log')
  .option('--all', 'show entire log history (default: last 20)')
  .option('--blocked', 'show only blocked commands')
  .option('--danger', 'show only commands that triggered danger warnings')
  .option('-n <count>', 'number of entries to show', '20')
  .option('--clear', 'clear the log (requires --yes)')
  .option('--yes', 'confirm destructive operations without prompting')
  .option('--path', 'print the log file path')
  .option('--report', 'show a summary report of the full log')
  .action((opts) => {
    if (opts.path) { console.log(LOG_PATH); return; }
    if (opts.report) { console.log(generateReport(readLog())); return; }
    if (opts.clear) {
      if (!opts.yes) {
        const count = readLog().length;
        console.log(`This will permanently delete ${count} log entr${count === 1 ? 'y' : 'ies'} from:`);
        console.log(`  ${LOG_PATH}`);
        console.log(`Run \`wtflag log --clear --yes\` to confirm.`);
        return;
      }
      clearLog();
      console.log('✓ Log cleared.');
      return;
    }

    const all = readLog();
    let entries = all;
    if (opts.blocked) entries = all.filter(e => e.blocked);
    else if (opts.danger) entries = all.filter(e => e.danger?.length > 0);

    const count = opts.all ? entries.length : parseInt(opts.n, 10);
    const shown = entries.slice(-count);

    if (!shown.length) {
      console.log('No log entries found.');
      return;
    }

    for (const entry of shown) {
      const d = new Date(entry.ts);
      const ts = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const tag = entry.blocked
        ? '[BLOCKED]'.padEnd(10)
        : entry.dangerLevel === 'danger'
          ? '[DANGER] '.padEnd(10)
          : entry.dangerLevel === 'warning'
            ? '[WARNING]'.padEnd(10)
            : '         ';
      const cwd = entry.cwd ? ` (${entry.cwd.replace(homedir(), '~')})` : '';
      console.log(`${ts}  ${tag}  ${entry.command}${cwd}`);
    }

    if (entries.length > count) {
      console.log(`\n  … ${entries.length - count} older entries hidden. Use --all to see everything.`);
    }
    console.log(`\n  ${shown.length} of ${all.length} total entries  •  ${LOG_PATH}`);
  });

// --- Profiles ---

const profileCmd = program
  .command('profile')
  .description('Manage configuration profiles');

profileCmd
  .command('list')
  .description('List available profiles')
  .action(() => {
    const { builtin, user } = listProfiles();
    console.log('Built-in profiles:');
    for (const [name, p] of Object.entries(builtin)) {
      console.log(`  ${name.padEnd(12)}${p.description}`);
    }
    if (user.length) {
      console.log('\nUser profiles:');
      for (const name of user) console.log(`  ${name}`);
    } else {
      console.log('\nNo user profiles yet. Use `wtflag profile save <name>` to create one.');
    }
  });

profileCmd
  .command('show <name>')
  .description("Show a profile's contents")
  .action((name) => {
    const p = getProfile(name);
    if (!p) { console.log(`Profile '${name}' not found. Run \`wtflag profile list\` to see available profiles.`); return; }
    console.log(`Profile: ${name}${p.description ? ` — ${p.description}` : ''}`);
    if (p.blocked?.length)       console.log(`  Blocked commands:  ${p.blocked.join(', ')}`);
    if (p.blockPatterns?.length) console.log(`  Block patterns:    ${p.blockPatterns.join(', ')}`);
    if (p.muted?.length)         console.log(`  Muted:             ${p.muted.join(', ')}`);
    if (!p.blocked?.length && !p.blockPatterns?.length && !p.muted?.length) console.log('  (empty profile)');
  });

profileCmd
  .command('save <name>')
  .description('Save current mute/block config as a named profile')
  .action((name) => {
    try {
      const data = {
        blocked: listBlocklist(),
        blockPatterns: listBlockPatterns(),
        muted: listMutelist(),
      };
      saveProfile(name, data);
      console.log(`✓ Profile '${name}' saved.`);
      if (data.blocked.length)       console.log(`  Blocked: ${data.blocked.join(', ')}`);
      if (data.blockPatterns.length) console.log(`  Patterns: ${data.blockPatterns.join(', ')}`);
      if (data.muted.length)         console.log(`  Muted: ${data.muted.join(', ')}`);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  });

profileCmd
  .command('load <name>')
  .description('Apply a profile — replaces current mute/block settings')
  .action((name) => {
    const p = getProfile(name);
    if (!p) { console.log(`Profile '${name}' not found. Run \`wtflag profile list\` to see available profiles.`); return; }
    const currentBlocked = listBlocklist();
    const currentMuted = listMutelist();
    const currentPatterns = listBlockPatterns();
    if (currentBlocked.length || currentMuted.length || currentPatterns.length) {
      console.log('Replacing current config:');
      if (currentBlocked.length)   console.log(`  Blocked: ${currentBlocked.join(', ')}`);
      if (currentPatterns.length)  console.log(`  Patterns: ${currentPatterns.length} pattern(s)`);
      if (currentMuted.length)     console.log(`  Muted: ${currentMuted.join(', ')}`);
    }
    setMutelist(p.muted ?? []);
    setBlocklist(p.blocked ?? []);
    setBlockPatterns(p.blockPatterns ?? []);
    console.log(`✓ Profile '${name}' applied.`);
    if (p.blocked?.length)       console.log(`  Blocked: ${p.blocked.join(', ')}`);
    if (p.blockPatterns?.length) console.log(`  Block patterns: ${p.blockPatterns.length} patterns`);
    if (p.muted?.length)         console.log(`  Muted: ${p.muted.join(', ')}`);
  });

profileCmd
  .command('delete <name>')
  .description('Delete a user-saved profile (built-ins cannot be deleted)')
  .action((name) => {
    const removed = deleteProfile(name);
    if (removed) {
      console.log(`✓ Profile '${name}' deleted.`);
    } else if (BUILTIN[name]) {
      console.log(`'${name}' is a built-in profile and cannot be deleted.`);
    } else {
      console.log(`Profile '${name}' not found.`);
    }
  });

// --- Sound ---

const soundCmd = program
  .command('sound')
  .description('Control ping sounds for permission prompts and task completion');

soundCmd
  .command('on')
  .description('Enable ping sounds — plays when Claude asks permission or finishes')
  .action(() => {
    setSoundEnabled(true);
    installSoundHooks();
    console.log('✓ Sound enabled — you\'ll hear a ping when Claude asks for permission or is done.');
    console.log('  Restart Claude Code to activate the hooks.');
  });

soundCmd
  .command('off')
  .description('Disable ping sounds')
  .action(() => {
    setSoundEnabled(false);
    uninstallSoundHooks();
    console.log('✓ Sound disabled.');
  });

soundCmd
  .command('play [event]')
  .description('Play a sound immediately (events: notification, stop) — used by hooks')
  .action((event = 'notification') => {
    if (isSoundEnabled()) playSound(event);
  });

soundCmd
  .command('status')
  .description('Show whether sound is enabled')
  .action(() => {
    const enabled = isSoundEnabled();
    const hooked = isSoundHookInstalled();
    console.log(`Sound: ${enabled ? 'on' : 'off'}`);
    if (enabled && !hooked) {
      console.log('  Warning: hooks not found in settings.json — run `wtflag sound on` to reinstall.');
    }
  });

// --- Project config info ---

program
  .command('project-config')
  .description('Show the .wtflag.json active for the current directory')
  .action(() => {
    const found = findProjectConfig(process.cwd());
    if (!found) {
      console.log('No .wtflag.json found in this directory or any parent directory.');
      console.log('Create one to set per-project rules:');
      console.log('  { "blocked": ["kubectl delete"], "muted": ["eslint"] }');
    } else {
      console.log(`Active project config: ${found.path}`);
      console.log(JSON.stringify(found.config, null, 2));
    }
  });

// --- Diff explanation ---

program
  .command('diff [refs...]')
  .description('Explain a git diff — pipe one in or pass git refs (e.g. HEAD~1, main..feature)')
  .action(async (refs) => {
    let text;
    if (refs.length > 0) {
      const result = spawnSync('git', ['diff', ...refs], { encoding: 'utf8' });
      if (result.error) { console.error(`git error: ${result.error.message}`); process.exit(1); }
      text = result.stdout ?? '';
      if (!text && result.stderr) { console.error(result.stderr.trim()); process.exit(1); }
    } else if (!process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      text = chunks.join('');
    } else {
      console.log('Usage: git diff | wtflag diff');
      console.log('   or: wtflag diff HEAD~1');
      console.log('   or: wtflag diff main..feature-branch');
      process.exit(0);
    }
    const output = explainDiff(text);
    console.log(output ?? 'No changes found in diff.');
  });

// --- Export ---

program
  .command('export')
  .description('Export the audit log as JSON or CSV')
  .option('--format <format>', 'output format: json or csv', 'json')
  .action((opts) => {
    const entries = readLog();
    if (!entries.length) { console.log('[]'); return; }
    if (opts.format === 'csv') {
      const header = 'ts,command,cwd,blocked,blockedBy,blockedType,dangerLevel,danger';
      const rows = entries.map(e => [
        e.ts ?? '',
        _csv(e.command ?? ''),
        _csv(e.cwd ?? ''),
        e.blocked ? 'true' : 'false',
        _csv(e.blockedBy ?? ''),
        _csv(e.blockedType ?? ''),
        _csv(e.dangerLevel ?? ''),
        _csv((e.danger ?? []).join('; ')),
      ].join(','));
      console.log([header, ...rows].join('\n'));
    } else {
      console.log(JSON.stringify(entries, null, 2));
    }
  });

function _csv(val) {
  if (!val || (!val.includes(',') && !val.includes('"') && !val.includes('\n'))) return val;
  return '"' + val.replace(/"/g, '""') + '"';
}

// --- Custom danger rules ---

const dangerRulesCmd = program
  .command('danger-rules')
  .description('Manage custom danger detection rules (~/.config/wtflag/danger-rules.json)');

dangerRulesCmd
  .command('list')
  .description('List all custom danger rules')
  .action(() => {
    const rules = listCustomRules();
    if (!rules.length) {
      console.log('No custom danger rules. Use `wtflag danger-rules add` to create one.');
      return;
    }
    console.log('Custom danger rules:');
    rules.forEach((r, i) => {
      console.log(`  [${i}] ${r.level.padEnd(7)}  ${r.message}`);
      console.log(`        pattern: ${r.pattern}`);
    });
  });

dangerRulesCmd
  .command('add')
  .description('Add a custom danger rule')
  .requiredOption('--pattern <regex>', 'regular expression to match against the command string')
  .requiredOption('--level <level>', 'severity level: danger or warning')
  .requiredOption('--message <text>', 'description shown when the rule fires')
  .action((opts) => {
    if (!['danger', 'warning'].includes(opts.level)) {
      console.error('Error: --level must be "danger" or "warning".');
      process.exit(1);
    }
    try {
      addCustomRule(opts.pattern, opts.level, opts.message);
      console.log(`✓ Rule added (${opts.level}): ${opts.message}`);
      console.log(`  Pattern: ${opts.pattern}`);
    } catch (e) {
      console.error(`Error: invalid regex pattern — ${e.message}`);
      process.exit(1);
    }
  });

dangerRulesCmd
  .command('remove <index>')
  .description('Remove a custom rule by index (see `wtflag danger-rules list`)')
  .action((index) => {
    const i = parseInt(index, 10);
    if (isNaN(i)) { console.error('Error: index must be a number.'); process.exit(1); }
    const removed = removeCustomRule(i);
    if (removed) {
      console.log(`✓ Rule [${i}] removed.`);
    } else {
      console.log(`No rule at index ${i}. Run \`wtflag danger-rules list\` to see available rules.`);
    }
  });

dangerRulesCmd
  .command('test <command>')
  .description('Test which danger rules (built-in and custom) fire for a command string')
  .action((cmd) => {
    const results = checkDanger(cmd);
    if (!results.length) {
      console.log('No danger rules matched.');
    } else {
      console.log(`${results.length} rule(s) matched:`);
      for (const { level, message } of results) {
        console.log(`  [${level}]  ${message}`);
      }
    }
  });

program.parse();
