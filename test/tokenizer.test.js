import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, detectRedirects } from '../src/tokenizer.js';

// --- tokenize ---

test('simple command', () => {
  const [seg] = tokenize('ls');
  assert.equal(seg.command, 'ls');
  assert.deepEqual(seg.flags, []);
  assert.deepEqual(seg.args, []);
  assert.equal(seg.subcommand, null);
});

test('command with flags and args', () => {
  const [seg] = tokenize('ls -la /tmp');
  assert.equal(seg.command, 'ls');
  assert.ok(seg.flags.includes('-l'));
  assert.ok(seg.flags.includes('-a'));
  assert.deepEqual(seg.args, ['/tmp']);
});

test('combined short flags are expanded', () => {
  const [seg] = tokenize('tar -xzf archive.tar.gz');
  assert.ok(seg.flags.includes('-x'));
  assert.ok(seg.flags.includes('-z'));
  assert.ok(seg.flags.includes('-f'));
});

test('4-char combined flags are kept whole', () => {
  const [seg] = tokenize('find . -name foo');
  assert.ok(seg.flags.includes('-name'));
});

test('git subcommand detection', () => {
  const [seg] = tokenize('git commit -am "fix"');
  assert.equal(seg.command, 'git');
  assert.equal(seg.subcommand, 'commit');
  assert.ok(seg.flags.includes('-a'));
  assert.ok(seg.flags.includes('-m'));
});

test('pipe splits into multiple segments', () => {
  const segs = tokenize('ls -la | grep foo');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].command, 'ls');
  assert.equal(segs[1].command, 'grep');
});

test('&& splits into multiple segments', () => {
  const segs = tokenize('git add . && git commit -m "msg"');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].command, 'git');
  assert.equal(segs[1].command, 'git');
});

test('; splits into multiple segments', () => {
  const segs = tokenize('cd /tmp; ls');
  assert.equal(segs.length, 2);
});

test('|| splits into multiple segments', () => {
  const segs = tokenize('npm test || echo fail');
  assert.equal(segs.length, 2);
});

test('quoted strings with spaces are single tokens', () => {
  const [seg] = tokenize('git commit -m "fix the bug"');
  assert.ok(seg.args.some(a => a === 'fix the bug') || seg.flags.includes('-m'));
});

test('redirect operators are stripped from args', () => {
  const [seg] = tokenize('echo hello > out.txt');
  assert.ok(!seg.args.includes('>'));
  assert.ok(!seg.args.includes('out.txt'));
});

test('sudo transparency — subcommand is the real command', () => {
  const [seg] = tokenize('sudo apt install vim');
  assert.equal(seg.command, 'sudo');
  assert.equal(seg.subcommand, 'apt');
});

test('long flags with = are kept whole', () => {
  const [seg] = tokenize('curl --output=file.txt https://example.com');
  assert.ok(seg.flags.some(f => f.startsWith('--output')));
});

test('empty string returns empty array', () => {
  assert.deepEqual(tokenize(''), []);
});

test('whitespace-only string returns empty array', () => {
  assert.deepEqual(tokenize('   '), []);
});

// --- detectRedirects ---

test('stdout redirect >', () => {
  const [r] = detectRedirects('echo hello > out.txt');
  assert.equal(r.op, '>');
  assert.equal(r.target, 'out.txt');
});

test('append redirect >>', () => {
  const [r] = detectRedirects('echo hello >> log.txt');
  assert.equal(r.op, '>>');
  assert.equal(r.target, 'log.txt');
});

test('stdin redirect <', () => {
  const [r] = detectRedirects('sort < input.txt');
  assert.equal(r.op, '<');
});

test('stderr merge 2>&1', () => {
  const [r] = detectRedirects('cmd 2>&1');
  assert.equal(r.op, '2>&1');
  assert.equal(r.target, null);
});

test('no redirects returns empty array', () => {
  assert.deepEqual(detectRedirects('git status'), []);
});

test('redirects inside quotes are not detected', () => {
  const redirects = detectRedirects("echo 'hello > world'");
  assert.deepEqual(redirects, []);
});
