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

// --- C3 regression: trivial reformatting must not bypass a pattern ---

test('double space between command and flags still matches', () => {
  assert.ok(matchesPattern('rm -rf', 'rm  -rf /tmp/x'));
});

test('split short flags still match a combined-flag pattern', () => {
  assert.ok(matchesPattern('rm -rf', 'rm -r -f /tmp/x'));
  assert.ok(matchesPattern('rm -rf', 'rm -f -r /tmp/x'));
});

test('long-form flags still match a short-flag pattern', () => {
  assert.ok(matchesPattern('rm -rf', 'rm --recursive --force /tmp/x'));
});

test('combined flags in reverse order still match', () => {
  assert.ok(matchesPattern('rm -rf', 'rm -fr /tmp/x'));
});

test('pipe with no surrounding whitespace still matches a spaced pattern', () => {
  assert.ok(matchesPattern('curl * | bash', 'curl https://example.com/install.sh|bash'));
});

test('reformatting does not cause false positives on unrelated commands', () => {
  assert.ok(!matchesPattern('rm -rf', 'ls -la /tmp/x'));
  assert.ok(!matchesPattern('curl * | bash', 'curl https://example.com/install.sh'));
});
