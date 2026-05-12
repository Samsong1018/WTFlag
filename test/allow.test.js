import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), `wtflag-allow-test-${process.pid}`);
process.env.HOME = TMP;
mkdirSync(join(TMP, '.claude'), { recursive: true });

const { allowCommand, disallowCommand, allowAll, disallowAll, listAllowed } =
  await import('../src/allow.js');

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

test('listAllowed returns empty array initially', () => {
  assert.deepEqual(listAllowed(), []);
});

test('allowCommand adds a Bash(command:...*) entry', () => {
  const entry = allowCommand('git');
  assert.equal(entry, 'Bash(command:git*)');
  assert.ok(listAllowed().includes('Bash(command:git*)'));
});

test('allowCommand normalizes to lowercase', () => {
  allowCommand('NPM');
  assert.ok(listAllowed().includes('Bash(command:npm*)'));
});

test('allowCommand is idempotent', () => {
  allowCommand('git');
  const count = listAllowed().filter(e => e === 'Bash(command:git*)').length;
  assert.equal(count, 1);
});

test('disallowCommand removes the entry', () => {
  const removed = disallowCommand('git');
  assert.ok(removed);
  assert.ok(!listAllowed().includes('Bash(command:git*)'));
});

test('disallowCommand returns false when entry not present', () => {
  const removed = disallowCommand('nonexistent');
  assert.ok(!removed);
});

test('allowAll adds Bash entry', () => {
  allowAll();
  assert.ok(listAllowed().includes('Bash'));
});

test('allowAll is idempotent', () => {
  allowAll();
  const count = listAllowed().filter(e => e === 'Bash').length;
  assert.equal(count, 1);
});

test('disallowAll removes Bash entry', () => {
  disallowAll();
  assert.ok(!listAllowed().includes('Bash'));
});

test('listAllowed only returns wtflag-managed entries', () => {
  allowCommand('docker');
  const allowed = listAllowed();
  assert.ok(allowed.every(e => e === 'Bash' || e.startsWith('Bash(command:')));
});
