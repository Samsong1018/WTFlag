import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Isolate platform's CONFIG_DIR by overriding HOME before any import
const TMP = join(tmpdir(), `wtflag-profiles-test-${process.pid}`);
process.env.HOME = TMP;
mkdirSync(join(TMP, '.config', 'wtflag', 'profiles'), { recursive: true });

const { getProfile, saveProfile, deleteProfile, listProfiles, BUILTIN } =
  await import('../src/profiles.js');

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

// --- Built-ins ---

test('built-in profiles exist', () => {
  assert.ok(BUILTIN.safe);
  assert.ok(BUILTIN.dev);
  assert.ok(BUILTIN.readonly);
});

test('getProfile returns built-in', () => {
  const p = getProfile('safe');
  assert.ok(Array.isArray(p.blocked));
  assert.ok(Array.isArray(p.blockPatterns));
});

// --- Save / get / delete ---

test('saveProfile and getProfile round-trip', () => {
  saveProfile('myprofile', { blocked: ['rm'], muted: ['ls'], blockPatterns: [] });
  const p = getProfile('myprofile');
  assert.deepEqual(p.blocked, ['rm']);
  assert.deepEqual(p.muted, ['ls']);
});

test('deleteProfile removes the profile', () => {
  saveProfile('todelete', { blocked: [], muted: [], blockPatterns: [] });
  assert.ok(getProfile('todelete') !== null);
  const removed = deleteProfile('todelete');
  assert.ok(removed);
  assert.equal(getProfile('todelete'), null);
});

test('deleteProfile returns false for nonexistent profile', () => {
  assert.ok(!deleteProfile('doesnotexist'));
});

test('deleteProfile returns false for built-in profile', () => {
  assert.ok(!deleteProfile('safe'));
});

test('saveProfile throws when overwriting built-in', () => {
  assert.throws(() => saveProfile('safe', {}), /built-in/);
});

test('listProfiles includes built-ins and saved user profiles', () => {
  saveProfile('listed', { blocked: [], muted: [], blockPatterns: [] });
  const { builtin, user } = listProfiles();
  assert.ok(builtin.safe);
  assert.ok(user.includes('listed'));
});

// --- Path traversal validation ---

test('saveProfile rejects path traversal in name', () => {
  assert.throws(() => saveProfile('../../etc/evil', {}), /Invalid profile name/);
});

test('saveProfile rejects names with forward slash', () => {
  assert.throws(() => saveProfile('a/b', {}), /Invalid profile name/);
});

test('saveProfile rejects names with backslash', () => {
  assert.throws(() => saveProfile('a\\b', {}), /Invalid profile name/);
});

test('saveProfile rejects empty name', () => {
  assert.throws(() => saveProfile('', {}), /non-empty/);
});

test('saveProfile rejects names with special characters', () => {
  assert.throws(() => saveProfile('bad name!', {}), /Invalid profile name/);
});

test('saveProfile accepts valid names', () => {
  assert.doesNotThrow(() => saveProfile('valid-name_1', { blocked: [], muted: [], blockPatterns: [] }));
  deleteProfile('valid-name_1');
});

test('getProfile silently returns null for traversal names', () => {
  assert.equal(getProfile('../../etc/passwd'), null);
});

test('deleteProfile silently returns false for traversal names', () => {
  assert.ok(!deleteProfile('../evil'));
});
