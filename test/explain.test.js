import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, renderBlocked, renderConfigError, effectiveCommand, resolveRealCommands } from '../src/explain.js';
import { tokenize } from '../src/tokenizer.js';

test('explain returns a string for a known command', () => {
  const out = explain('git status');
  assert.ok(typeof out === 'string');
  assert.ok(out.includes('git'));
});

test('explain returns a string for a command with flags and args', () => {
  const out = explain('ls -la /tmp');
  assert.ok(typeof out === 'string');
  assert.ok(out.includes('ls'));
});

test('explain returns null for a fully muted command', () => {
  const out = explain('git status', { mutelist: new Set(['git']) });
  assert.equal(out, null);
});

test('explain handles piped commands', () => {
  const out = explain('ls | grep foo');
  assert.ok(typeof out === 'string');
  assert.ok(out.includes('ls'));
  assert.ok(out.includes('grep'));
});

test('explain mutes only the matched segment in a pipeline', () => {
  const out = explain('ls | grep foo', { mutelist: new Set(['ls']) });
  assert.ok(typeof out === 'string');
  assert.ok(out.includes('grep'));
  assert.ok(!out.includes('ls —') && !out.includes('ls\n'));
});

test('explain returns null when all segments are muted', () => {
  const out = explain('ls | grep foo', { mutelist: new Set(['ls', 'grep']) });
  assert.equal(out, null);
});

test('explain handles && chained commands', () => {
  const out = explain('git add . && git commit -m "fix"');
  assert.ok(typeof out === 'string');
});

test('renderBlocked produces BLOCKED output for command block', () => {
  const out = renderBlocked('rm', 'rm -rf /tmp', false);
  assert.ok(out.includes('BLOCKED'));
  assert.ok(out.includes('rm'));
  assert.ok(out.includes('block list'));
});

test('renderBlocked marks pattern blocks with pattern language', () => {
  const out = renderBlocked('rm -rf', 'rm -rf /tmp', true);
  assert.ok(out.includes('BLOCKED'));
  assert.ok(out.includes('pattern'));
});

test('effectiveCommand resolves sudo to the real command', () => {
  assert.equal(effectiveCommand({ command: 'sudo', subcommand: 'apt' }), 'apt');
});

test('effectiveCommand returns command when not sudo', () => {
  assert.equal(effectiveCommand({ command: 'git', subcommand: 'commit' }), 'git');
});

test('effectiveCommand lowercases the result', () => {
  assert.equal(effectiveCommand({ command: 'GIT', subcommand: null }), 'git');
});

// --- sudo -u fix ---

test('effectiveCommand resolves sudo -u user to the real command, not the user', () => {
  const [seg] = tokenize('sudo -u root rm -rf /');
  assert.equal(effectiveCommand(seg), 'rm');
});

test('renderBlocked/explain sudo -u rendering resolves to the real command label', () => {
  const out = explain('sudo -u root rm -rf /tmp/x');
  assert.ok(out.includes('sudo rm'));
  assert.ok(!out.includes('sudo root'));
});

test('effectiveCommand basename-normalizes path-qualified commands', () => {
  const [seg] = tokenize('/bin/rm -rf /tmp/x');
  assert.equal(effectiveCommand(seg), 'rm');
});

test('effectiveCommand strips a leading backslash', () => {
  const [seg] = tokenize('\\rm -rf /tmp/x');
  assert.equal(effectiveCommand(seg), 'rm');
});

// --- C2: wrapper/indirection resolution for the block list ---

test('resolveRealCommands sees through bash -c', () => {
  assert.ok(resolveRealCommands('bash -c "rm -rf /tmp/x"').includes('rm'));
});

test('resolveRealCommands sees through sh -c with single quotes', () => {
  assert.ok(resolveRealCommands("sh -c 'rm -rf /tmp/x'").includes('rm'));
});

test('resolveRealCommands sees through python3 -c os.system(...)', () => {
  assert.ok(resolveRealCommands(`python3 -c "import os; os.system('rm -rf /tmp/x')"`).includes('rm'));
});

test('resolveRealCommands sees through xargs', () => {
  assert.ok(resolveRealCommands('xargs rm -rf').includes('rm'));
});

test('resolveRealCommands sees through find -exec', () => {
  assert.ok(resolveRealCommands('find . -exec rm -rf {} \\;').includes('rm'));
});

test('resolveRealCommands sees through nohup', () => {
  assert.ok(resolveRealCommands('nohup rm -rf /tmp/x').includes('rm'));
});

test('resolveRealCommands sees through env', () => {
  assert.ok(resolveRealCommands('env rm -rf /tmp/x').includes('rm'));
});

test('resolveRealCommands sees through command', () => {
  assert.ok(resolveRealCommands('command rm -rf /tmp/x').includes('rm'));
});

test('resolveRealCommands basename-normalizes an absolute path form', () => {
  assert.ok(resolveRealCommands('/bin/rm -rf /tmp/x').includes('rm'));
});

test('resolveRealCommands strips a leading backslash', () => {
  assert.ok(resolveRealCommands('\\rm -rf /tmp/x').includes('rm'));
});

test('resolveRealCommands resolves sudo -u to the real command', () => {
  assert.ok(resolveRealCommands('sudo -u root rm -rf /').includes('rm'));
});

test('resolveRealCommands does not falsely flag unrelated commands', () => {
  assert.ok(!resolveRealCommands('git status').includes('rm'));
});

// --- C1: renderConfigError ---

test('renderConfigError produces a loud, BLOCKED-style box', () => {
  const out = renderConfigError('config.json is not valid JSON', 'rm -rf /tmp');
  assert.ok(out.includes('CONFIG ERROR'));
  assert.ok(out.includes('rm -rf /tmp'));
  assert.ok(out.includes("safe' profile"));
});
