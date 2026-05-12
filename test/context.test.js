import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getArgumentContext } from '../src/context.js';

function ctx(cmd, sub, args = [], flags = []) {
  return getArgumentContext(cmd, sub, args, flags);
}

test('returns null for unknown command', () => {
  assert.equal(ctx('unknowncmd123', null, [], []), null);
});

// --- git ---

test('git add . returns explanation mentioning staged changes', () => {
  const r = ctx('git', 'add', ['.'], []);
  assert.ok(r?.includes('staged') || r?.includes('snapshot') || r?.includes('change'));
});

test('git add single file includes filename', () => {
  const r = ctx('git', 'add', ['src/foo.js'], []);
  assert.ok(r?.includes('src/foo.js'));
});

test('git commit with message includes message text', () => {
  const r = ctx('git', 'commit', ['fix login bug'], ['-m']);
  assert.ok(r?.includes('fix login bug'));
});

test('git push with remote and branch mentions both', () => {
  const r = ctx('git', 'push', ['origin', 'main'], []);
  assert.ok(r?.includes('origin') && r?.includes('main'));
});

test('git status returns a non-null string', () => {
  const r = ctx('git', 'status', [], []);
  assert.ok(typeof r === 'string' && r.length > 0);
});

test('git log -5 mentions count', () => {
  const r = ctx('git', 'log', [], ['-5']);
  assert.ok(r?.includes('5'));
});

test('git checkout -b creates branch', () => {
  const r = ctx('git', 'checkout', ['feature'], ['-b']);
  assert.ok(r?.includes('feature') && (r?.includes('create') || r?.includes('creates')));
});

test('git stash pop mentions restoring', () => {
  const r = ctx('git', 'stash', ['pop'], []);
  assert.ok(r?.includes('restore') || r?.includes('most recent'));
});

// --- file ops ---

test('ls with directory shows directory name', () => {
  const r = ctx('ls', null, ['/tmp'], ['-l', '-a']);
  assert.ok(r?.includes('/tmp'));
});

test('rm single file includes filename', () => {
  const r = ctx('rm', null, ['file.txt'], []);
  assert.ok(r?.includes('file.txt'));
});

test('cp src to dest mentions both', () => {
  const r = ctx('cp', null, ['src.txt', 'dst.txt'], []);
  assert.ok(r?.includes('src.txt') && r?.includes('dst.txt'));
});

test('chmod with octal mode mentions file', () => {
  const r = ctx('chmod', null, ['755', 'script.sh'], []);
  assert.ok(r?.includes('script.sh'));
});

test('mkdir -p mentions parent dirs', () => {
  const r = ctx('mkdir', null, ['a/b/c'], ['-p']);
  assert.ok(r?.includes('parent'));
});

// --- network ---

test('curl with URL mentions the URL', () => {
  const r = ctx('curl', null, ['https://example.com/api'], []);
  assert.ok(r?.includes('example.com'));
});

test('grep with pattern and file', () => {
  const r = ctx('grep', null, ['foo', 'file.txt'], []);
  assert.ok(r?.includes('foo') && r?.includes('file.txt'));
});

// --- package managers ---

test('npm install with package mentions package name', () => {
  const r = ctx('npm', 'install', ['chalk'], []);
  assert.ok(r?.includes('chalk'));
});

test('docker run with image mentions image name', () => {
  const r = ctx('docker', 'run', ['nginx'], []);
  assert.ok(r?.includes('nginx'));
});

test('systemctl start mentions service name', () => {
  const r = ctx('systemctl', 'start', ['nginx'], []);
  assert.ok(r?.includes('nginx'));
});
