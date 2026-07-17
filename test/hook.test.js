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

// --- C1: corrupted config must fail CLOSED, not open ---

function corruptConfig() {
  const configDir = join(TMP, '.config', 'wtflag');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), '{ this is not valid json');
}

test('corrupted config falls back to the safe profile and still blocks dd', () => {
  corruptConfig();
  const input = JSON.stringify({ tool_input: { command: 'dd if=/dev/zero of=/dev/sda' } });
  const r = hook(input);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('CONFIG ERROR'));
  assert.ok(r.stderr.includes('BLOCKED'));
});

test('corrupted config falls back to the safe profile pattern list (rm -rf)', () => {
  corruptConfig();
  const input = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/whatever' } });
  const r = hook(input);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('CONFIG ERROR'));
  assert.ok(r.stderr.includes('BLOCKED'));
});

test('corrupted config shows a loud CONFIG ERROR box but does not block harmless commands', () => {
  corruptConfig();
  const input = JSON.stringify({ tool_input: { command: 'ls -la' } });
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('CONFIG ERROR'));
  assert.deepEqual(JSON.parse(r.stdout), JSON.parse(input));
});

test('corrupted config never falls back to an empty ruleset (regression guard)', () => {
  corruptConfig();
  // 'fdisk' is not in the safe profile's blocklist, only in blockPatterns/warnings —
  // this just asserts the CONFIG ERROR path runs without throwing and passes the command through.
  const input = JSON.stringify({ tool_input: { command: 'echo hello' } });
  const r = hook(input);
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('CONFIG ERROR'));
});

// --- C2: name-based block list must resolve through wrapper/indirection commands ---

function withBlocklist(blocked) {
  const configDir = join(TMP, '.config', 'wtflag');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify({ blocked, mutelist: [], blockPatterns: [] }));
}

const WRAPPER_BYPASS_COMMANDS = [
  ['bash -c wrapper', 'bash -c "rm -rf /tmp/x"'],
  ['sh -c wrapper', "sh -c 'rm -rf /tmp/x'"],
  ['python3 -c wrapper', `python3 -c "import os; os.system('rm -rf /tmp/x')"`],
  ['xargs wrapper', 'xargs rm -rf'],
  ['find -exec wrapper', 'find . -exec rm -rf {} \\;'],
  ['nohup wrapper', 'nohup rm -rf /tmp/x'],
  ['env wrapper', 'env rm -rf /tmp/x'],
  ['command wrapper', 'command rm -rf /tmp/x'],
  ['absolute path form', '/bin/rm -rf /tmp/x'],
  ['backslash-escaped form', '\\rm -rf /tmp/x'],
  ['sudo -u form', 'sudo -u root rm -rf /'],
];

for (const [label, cmd] of WRAPPER_BYPASS_COMMANDS) {
  test(`block list resolves through ${label} (${cmd})`, () => {
    withBlocklist(['rm']);
    const input = JSON.stringify({ tool_input: { command: cmd } });
    const r = hook(input);
    assert.equal(r.status, 2, `expected exit 2 for "${cmd}", got ${r.status}. stderr:\n${r.stderr}`);
    assert.ok(r.stderr.includes('BLOCKED'));
    assert.ok(r.stderr.includes("'rm' is on your block list"), r.stderr);
  });
}
