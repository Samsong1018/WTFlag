import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesPattern } from '../src/config.js';

test('exact substring match', () => {
  assert.ok(matchesPattern('rm -rf', 'rm -rf /tmp'));
});

test('wildcard matches any characters', () => {
  assert.ok(matchesPattern('curl * | bash', 'curl https://example.com/install.sh | bash'));
});

test('no match returns false', () => {
  assert.ok(!matchesPattern('rm -rf', 'ls -la'));
});

test('case-insensitive match', () => {
  assert.ok(matchesPattern('DROP TABLE', 'psql -c "drop table users"'));
});

test('special regex chars in pattern are escaped (dot is literal)', () => {
  assert.ok(matchesPattern('file.txt', 'rm file.txt'));
  assert.ok(!matchesPattern('filextxt', 'rm file.txt'));
});

test('wildcard matches empty suffix', () => {
  assert.ok(matchesPattern('git push*', 'git push'));
});

test('wildcard matches multi-word suffix', () => {
  assert.ok(matchesPattern('git push*', 'git push --force origin main'));
});

test('pattern at start of command matches', () => {
  assert.ok(matchesPattern('npm install', 'npm install lodash'));
});

test('partial word does not spuriously match word boundaries', () => {
  // 'rm' pattern should still match 'rm -rf' even without word boundary enforcement
  assert.ok(matchesPattern('rm', 'rm -rf /tmp'));
});
