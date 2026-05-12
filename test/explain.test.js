import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, renderBlocked, effectiveCommand } from '../src/explain.js';

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
