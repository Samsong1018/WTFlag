import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, isGitCommit, isGitPush } from '../src/secrets.js';

// Helpers to build minimal diff chunks
function makeDiff(filename, addedLines) {
  const lineCount = addedLines.length;
  return [
    `diff --git a/${filename} b/${filename}`,
    `--- /dev/null`,
    `+++ b/${filename}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...addedLines.map(l => `+${l}`),
  ].join('\n');
}

// ── isGitCommit / isGitPush ──────────────────────────────────────────────────

test('isGitCommit matches git commit', () => {
  assert.ok(isGitCommit('git commit -m "fix"'));
  assert.ok(isGitCommit('git commit --amend'));
  assert.ok(isGitCommit('git commit'));
});

test('isGitCommit does not match other git commands', () => {
  assert.ok(!isGitCommit('git push'));
  assert.ok(!isGitCommit('git status'));
  assert.ok(!isGitCommit('git log'));
});

test('isGitPush matches git push', () => {
  assert.ok(isGitPush('git push'));
  assert.ok(isGitPush('git push origin main'));
  assert.ok(isGitPush('git push --force origin main'));
});

test('isGitPush does not match other git commands', () => {
  assert.ok(!isGitPush('git commit -m "x"'));
  assert.ok(!isGitPush('git pull'));
});

// ── AWS ──────────────────────────────────────────────────────────────────────

test('detects AWS Access Key ID', () => {
  const diff = makeDiff('config.js', ["const key = 'AKIAIOSFODNN7EXAMPLE';"]);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'AWS Access Key ID');
  assert.equal(found[0].file, 'config.js');
  assert.equal(found[0].line, 1);
});

test('detects AWS Secret Access Key via env-style assignment', () => {
  const diff = makeDiff('.env', ['AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'AWS Secret Access Key');
});

// ── GitHub ───────────────────────────────────────────────────────────────────

test('detects GitHub PAT (ghp_ prefix)', () => {
  const diff = makeDiff('src/client.js', ['const token = "ghp_' + 'A'.repeat(36) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'GitHub Personal Access Token');
});

test('detects GitHub oauth token (gho_ prefix)', () => {
  const diff = makeDiff('auth.js', ['const t = "gho_' + 'B'.repeat(36) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'GitHub Personal Access Token');
});

// ── Anthropic / OpenAI ───────────────────────────────────────────────────────

test('detects Anthropic API key', () => {
  const diff = makeDiff('api.js', ['const key = "sk-ant-api03-' + 'x'.repeat(32) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Anthropic API Key');
});

test('detects OpenAI API key (old format)', () => {
  // 32 alphanumeric chars after sk- (not ant)
  const diff = makeDiff('openai.js', ['const key = "sk-' + 'T'.repeat(48) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'OpenAI API Key');
});

test('Anthropic key is NOT matched by OpenAI pattern', () => {
  const diff = makeDiff('api.js', ['const key = "sk-ant-api03-' + 'x'.repeat(32) + '";']);
  const found = parseDiff(diff);
  // Should only get one finding, and it should be Anthropic not OpenAI
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Anthropic API Key');
});

// ── Stripe ───────────────────────────────────────────────────────────────────

test('detects Stripe secret key', () => {
  const diff = makeDiff('payment.js', ['const sk = "sk_live_' + 'z'.repeat(24) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Stripe Secret Key');
});

test('does NOT flag Stripe test key (sk_test_)', () => {
  const diff = makeDiff('payment.js', ['const sk = "sk_test_' + 'z'.repeat(24) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

// ── Database URLs ─────────────────────────────────────────────────────────────

test('detects postgres URL with credentials', () => {
  const diff = makeDiff('db.js', ['const url = "postgres://admin:supersecretpassword@localhost:5432/mydb";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Database URL with credentials');
});

test('detects mongodb URL with credentials', () => {
  const diff = makeDiff('db.js', ['const url = "mongodb://root:password123@cluster0.mongodb.net/db";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Database URL with credentials');
});

test('does NOT flag DB URL without password (empty password)', () => {
  // less than 6 chars before @
  const diff = makeDiff('db.js', ['const url = "postgres://admin:pass@localhost/db";']);
  // "pass" is only 4 chars — should NOT match (requires 6+ chars)
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

// ── Private keys ──────────────────────────────────────────────────────────────

test('detects RSA private key header', () => {
  const diff = makeDiff('key.pem', ['-----BEGIN RSA PRIVATE KEY-----']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Private key');
});

test('detects OPENSSH private key header', () => {
  const diff = makeDiff('id_ed25519', ['-----BEGIN OPENSSH PRIVATE KEY-----']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Private key');
});

// ── Generic assignments ───────────────────────────────────────────────────────

test('detects generic api_key assignment with quotes', () => {
  const diff = makeDiff('config.js', ['const api_key = "myverylongsecretapikey12345";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Generic API key');
});

test('detects password assignment with quotes', () => {
  const diff = makeDiff('config.js', ['const password = "MySuperSecretPass!";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Password assignment');
});

test('does NOT flag api_key without quoted value', () => {
  // value is a function call, not a string literal
  const diff = makeDiff('config.js', ['const api_key = process.env.API_KEY;']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

// ── Skipped files ─────────────────────────────────────────────────────────────

test('skips .env.example files', () => {
  const diff = makeDiff('.env.example', ['STRIPE_SECRET_KEY=sk_live_' + 'z'.repeat(24)]);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('skips .env.sample files', () => {
  const diff = makeDiff('.env.sample', ['AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('scans .env files (not example)', () => {
  const diff = makeDiff('.env', ['STRIPE_SECRET_KEY=sk_live_' + 'z'.repeat(24)]);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
});

test('skips lock files', () => {
  const diff = makeDiff('package-lock.json', ['"resolved": "https://user:token12345678901234@registry.npmjs.org/pkg"']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('skips *.test.js files', () => {
  const diff = makeDiff('src/secrets.test.js', ["const key = 'AKIAIOSFODNN7EXAMPLE';"]);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('skips *.spec.ts files', () => {
  const diff = makeDiff('src/auth.spec.ts', ['const token = "ghp_' + 'A'.repeat(36) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('skips files inside test/ directory', () => {
  const diff = makeDiff('test/fixtures/keys.js', ["const key = 'AKIAIOSFODNN7EXAMPLE';"]);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('skips files inside __tests__ directory', () => {
  const diff = makeDiff('src/__tests__/api.js', ['const sk = "sk_live_' + 'z'.repeat(24) + '";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 0);
});

test('still scans regular source files', () => {
  const diff = makeDiff('src/config.js', ["const key = 'AKIAIOSFODNN7EXAMPLE';"]);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
});

// ── Redaction ─────────────────────────────────────────────────────────────────

test('redacts matched value to first 6 chars + ***', () => {
  const diff = makeDiff('config.js', ["const key = 'AKIAIOSFODNN7EXAMPLE';"]);
  const found = parseDiff(diff);
  assert.equal(found[0].redacted, 'AKIAIO***');
});

// ── Line and file tracking ────────────────────────────────────────────────────

test('tracks file and line number correctly', () => {
  const diff = [
    'diff --git a/src/auth.js b/src/auth.js',
    '--- a/src/auth.js',
    '+++ b/src/auth.js',
    '@@ -5,3 +5,4 @@',
    ' existing line',
    ' another line',
    '+const key = "AKIAIOSFODNN7EXAMPLE";',
    ' trailing line',
  ].join('\n');
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'src/auth.js');
  assert.equal(found[0].line, 7); // starts at 5, +2 context lines, +1 for the added line
});

test('clean diff produces no findings', () => {
  const diff = makeDiff('src/index.js', [
    'const x = 1;',
    'function greet(name) { return `Hello, ${name}`; }',
  ]);
  assert.deepEqual(parseDiff(diff), []);
});

test('removal lines (starting with -) are not scanned', () => {
  const diff = [
    'diff --git a/config.js b/config.js',
    '--- a/config.js',
    '+++ b/config.js',
    '@@ -1,1 +1,1 @@',
    '-const key = "AKIAIOSFODNN7EXAMPLE";',
    '+const key = process.env.AWS_ACCESS_KEY_ID;',
  ].join('\n');
  const found = parseDiff(diff);
  // Removal line should not produce findings; replacement line has no secret
  assert.equal(found.length, 0);
});

// ── Slack ─────────────────────────────────────────────────────────────────────

test('detects Slack bot token', () => {
  const diff = makeDiff('slack.js', ['const token = "xoxb-FAKESLACKTOKEN12345";']);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'Slack Token');
});

// ── SendGrid ──────────────────────────────────────────────────────────────────

test('detects SendGrid API key', () => {
  const key = 'SG.' + 'A'.repeat(22) + '.' + 'B'.repeat(43);
  const diff = makeDiff('email.js', [`const sgKey = "${key}";`]);
  const found = parseDiff(diff);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'SendGrid API Key');
});
