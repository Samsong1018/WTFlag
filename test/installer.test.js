import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), `wtflag-installer-test-${process.pid}`);
process.env.HOME = TMP;
mkdirSync(join(TMP, '.claude'), { recursive: true });

const {
  install, uninstall, isHookInstalled,
  installSoundHooks, uninstallSoundHooks, isSoundHookInstalled,
} = await import('../src/installer.js');
const { HOOK_COMMAND } = await import('../src/platform.js');

const settingsPath = join(TMP, '.claude', 'settings.json');

function readSettings() {
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, 'utf8'));
}

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

test('isHookInstalled returns false when settings.json is absent', () => {
  assert.equal(isHookInstalled(), false);
});

test('install adds the PreToolUse hook entry', () => {
  install();
  const hooks = readSettings().hooks?.PreToolUse ?? [];
  const found = hooks.some(h => Array.isArray(h.hooks) && h.hooks.some(e => e.command === HOOK_COMMAND));
  assert.ok(found);
});

test('isHookInstalled returns true after install', () => {
  assert.equal(isHookInstalled(), true);
});

test('install is idempotent — second call does not duplicate entry', () => {
  install();
  const hooks = readSettings().hooks?.PreToolUse ?? [];
  const count = hooks.filter(
    h => Array.isArray(h.hooks) && h.hooks.some(e => e.command === HOOK_COMMAND)
  ).length;
  assert.equal(count, 1);
});

test('uninstall removes the hook entry', () => {
  uninstall();
  const hooks = readSettings().hooks?.PreToolUse ?? [];
  const found = hooks.some(h => Array.isArray(h.hooks) && h.hooks.some(e => e.command === HOOK_COMMAND));
  assert.ok(!found);
});

test('isHookInstalled returns false after uninstall', () => {
  assert.equal(isHookInstalled(), false);
});

test('isSoundHookInstalled returns false initially', () => {
  assert.equal(isSoundHookInstalled(), false);
});

test('installSoundHooks adds Stop and Notification hooks', () => {
  installSoundHooks();
  assert.ok(isSoundHookInstalled());
});

test('installSoundHooks is idempotent', () => {
  installSoundHooks();
  const s = readSettings();
  const stopCount = (s.hooks?.Stop ?? []).length;
  const notifCount = (s.hooks?.Notification ?? []).length;
  assert.equal(stopCount, 1);
  assert.equal(notifCount, 1);
});

test('uninstallSoundHooks removes sound hooks', () => {
  uninstallSoundHooks();
  assert.ok(!isSoundHookInstalled());
});
