#!/usr/bin/env node
import { program } from 'commander';
import { homedir } from 'node:os';
import { install, uninstall } from '../src/installer.js';
import { explain } from '../src/explain.js';
import { runHook } from '../src/hook.js';
import { startWatcher } from '../src/watcher.js';
import { buildDb } from '../scripts/build-db.js';
import {
  addToMutelist, removeFromMutelist, listMutelist,
  addToBlocklist, removeFromBlocklist, listBlocklist,
  addBlockPattern, removeBlockPattern, listBlockPatterns,
  setMutelist, setBlocklist, setBlockPatterns,
} from '../src/config.js';
import { allowCommand, disallowCommand, allowAll, disallowAll, listAllowed } from '../src/allow.js';
import { readLog, clearLog, LOG_PATH } from '../src/log.js';
import { getProfile, saveProfile, deleteProfile, listProfiles, BUILTIN } from '../src/profiles.js';
import { findProjectConfig } from '../src/project-config.js';

program
  .name('wtflag')
  .description('Explains shell commands run by Claude Code')
  .version('0.1.0');

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
  .action(runHook);

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
      console.log('✓ All Bash commands will be auto-accepted — no permission prompts.');
      console.log('✓ Autonomy section added to ~/.claude/CLAUDE.md — safety confirmations suppressed.');
      console.log('  Note: commands on your block list are still prevented.');
      console.log('  Run `wtflag disallow-all` to revert both changes.');
    } else {
      console.log('✓ allowedTools already set — updated CLAUDE.md autonomy section.');
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
  .option('--clear', 'clear the log')
  .option('--path', 'print the log file path')
  .action((opts) => {
    if (opts.path) { console.log(LOG_PATH); return; }
    if (opts.clear) {
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

program.parse();
