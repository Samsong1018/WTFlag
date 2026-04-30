#!/usr/bin/env node
import { program } from 'commander';
import { install, uninstall } from '../src/installer.js';
import { explain } from '../src/explain.js';
import { runHook } from '../src/hook.js';
import { startWatcher } from '../src/watcher.js';
import { buildDb } from '../scripts/build-db.js';
import { addToMutelist, removeFromMutelist, listMutelist, addToBlocklist, removeFromBlocklist, listBlocklist } from '../src/config.js';
import { allowCommand, disallowCommand, allowAll, disallowAll, listAllowed } from '../src/allow.js';

program
  .name('wtflag')
  .description('Explains shell commands run by Claude Code')
  .version('0.1.0');

program
  .command('install')
  .description('Register the PreToolUse hook with Claude Code')
  .action(install);

program
  .command('uninstall')
  .description('Remove the hook from Claude Code')
  .action(uninstall);

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
  .description('Open the watcher terminal — explanations appear here as Claude runs commands')
  .action(startWatcher);

program
  .command('update-db')
  .description('Download and rebuild the tldr-pages database')
  .action(buildDb);

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

program
  .command('block <command>')
  .description('Prevent Claude from running a command entirely (e.g. rm, curl)')
  .action((cmd) => {
    const normalized = addToBlocklist(cmd);
    console.log(`✓ '${normalized}' blocked — Claude cannot run this command.`);
  });

program
  .command('unblock <command>')
  .description('Allow a previously blocked command to run again')
  .action((cmd) => {
    const removed = removeFromBlocklist(cmd);
    if (removed) {
      console.log(`✓ '${cmd.toLowerCase().trim()}' unblocked.`);
    } else {
      console.log(`'${cmd.toLowerCase().trim()}' was not in the block list.`);
    }
  });

program
  .command('blocked')
  .description('Show all blocked commands')
  .action(() => {
    const entries = listBlocklist();
    if (!entries.length) {
      console.log('Block list is empty. Use `wtflag block <command>` to add commands.');
    } else {
      console.log('Blocked commands (Claude cannot run these):');
      for (const cmd of entries) console.log(`  ${cmd}`);
    }
  });

program
  .command('allow <command>')
  .description('Auto-accept a command without a permission prompt (e.g. git, npm)')
  .action((cmd) => {
    const entry = allowCommand(cmd);
    console.log(`✓ '${cmd.toLowerCase().trim()}' auto-accepted — no permission prompt for this command.`);
    console.log(`  Added to allowedTools: ${entry}`);
    console.log(`  Note: blocked commands still take precedence.`);
  });

program
  .command('disallow <command>')
  .description('Remove auto-accept for a command (permission prompt will return)')
  .action((cmd) => {
    const removed = disallowCommand(cmd);
    if (removed) {
      console.log(`✓ '${cmd.toLowerCase().trim()}' removed from auto-accept — permission prompt will return.`);
    } else {
      console.log(`'${cmd.toLowerCase().trim()}' was not in the auto-accept list.`);
    }
  });

program
  .command('allow-all')
  .description('Auto-accept ALL Bash commands — no permission prompts (blocked commands still apply)')
  .action(() => {
    const added = allowAll();
    if (added) {
      console.log('✓ All Bash commands will be auto-accepted — no permission prompts.');
      console.log('  Note: commands on your block list are still prevented.');
      console.log('  Run `wtflag disallow-all` to revert.');
    } else {
      console.log('Allow-all is already enabled.');
    }
  });

program
  .command('disallow-all')
  .description('Remove the allow-all setting (permission prompts will return)')
  .action(() => {
    const removed = disallowAll();
    if (removed) {
      console.log('✓ Allow-all removed — permission prompts will return for Bash commands.');
    } else {
      console.log('Allow-all was not set.');
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

program.parse();
