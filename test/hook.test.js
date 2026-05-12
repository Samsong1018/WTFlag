import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(tmpdir(), `wtflag-hook-test-${process.pid}`);
mkdirSync(TMP, { recursive: true });

function hook(stdinData, extraEnv = {}) {
  return spawnSync('node', [join(ROOT, 'bin', 'wtflag.js'), 'hook'], {
    input: stdinData,
    env: { ...process.env, HOME: TMP, ...extraEnv },
    encoding: 'utf8',
    timeout: 10000,
  });
}

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

test('valid JSON passes through stdout unchanged', () => {
  const input = JSON.stringify({ tool_input: { command: 'ls -la' } });
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), JSON.parse(input));
});

test('invalid JSON passes through stdout unchanged', () => {
  const input = 'not json at all';
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, input);
});

test('empty JSON object is handled gracefully', () => {
  const input = JSON.stringify({});
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {});
});

test('missing command field passes through without error', () => {
  const input = JSON.stringify({ tool_input: {} });
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).tool_input, {});
});

test('known command writes explanation to stderr', () => {
  const input = JSON.stringify({ tool_input: { command: 'git status' } });
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('git'));
});

test('blocked command exits with code 2 and BLOCKED in stderr', () => {
  const configDir = join(TMP, '.config', 'wtflag');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify({
    blocked: ['dangeroustool999'],
    mutelist: [],
    blockPatterns: [],
  }));

  const input = JSON.stringify({ tool_input: { command: 'dangeroustool999 --flag' } });
  const r = hook(input);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('BLOCKED'));
});

test('pattern-blocked command exits with code 2', () => {
  const configDir = join(TMP, '.config', 'wtflag');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify({
    blocked: [],
    mutelist: [],
    blockPatterns: ['secret-pattern-test *'],
  }));

  const input = JSON.stringify({ tool_input: { command: 'secret-pattern-test --dangerous' } });
  const r = hook(input);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('BLOCKED'));
});
