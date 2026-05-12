import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), `wtflag-log-test-${process.pid}`);
process.env.HOME = TMP;
mkdirSync(TMP, { recursive: true });

const { appendLog, readLog, clearLog, LOG_PATH } = await import('../src/log.js');

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

test('LOG_PATH is inside the test home directory', () => {
  assert.ok(LOG_PATH.startsWith(TMP));
});

test('readLog returns empty array when log file does not exist', () => {
  assert.deepEqual(readLog(), []);
});

test('appendLog creates an entry with a timestamp', () => {
  appendLog({ command: 'ls -la', cwd: '/tmp', blocked: false, danger: [] });
  const entries = readLog();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].command, 'ls -la');
  assert.ok(typeof entries[0].ts === 'string');
});

test('appendLog accumulates multiple entries', () => {
  appendLog({ command: 'git status', cwd: '/tmp', blocked: false, danger: [] });
  const entries = readLog();
  assert.equal(entries.length, 2);
});

test('appendLog records blocked flag correctly', () => {
  appendLog({ command: 'rm -rf /', cwd: '/tmp', blocked: true, blockedBy: 'rm', danger: [] });
  const entries = readLog();
  const blocked = entries.find(e => e.blocked);
  assert.ok(blocked);
  assert.equal(blocked.command, 'rm -rf /');
  assert.equal(blocked.blockedBy, 'rm');
});

test('clearLog empties the log', () => {
  clearLog();
  assert.deepEqual(readLog(), []);
});

test('readLog filters out malformed lines gracefully', () => {
  writeFileSync(LOG_PATH, 'not-json\n{"ts":"2024-01-01","command":"ok","blocked":false}\n');
  const entries = readLog();
  assert.ok(Array.isArray(entries));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].command, 'ok');
});
