#!/usr/bin/env node
import { program } from 'commander';
import { install, uninstall } from '../src/installer.js';
import { explain } from '../src/explain.js';
import { runHook } from '../src/hook.js';
import { buildDb } from '../scripts/build-db.js';

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
  .command('update-db')
  .description('Download and rebuild the tldr-pages database')
  .action(buildDb);

program.parse();
