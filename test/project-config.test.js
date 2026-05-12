import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), `wtflag-projcfg-test-${process.pid}`);
process.env.HOME = TMP;
mkdirSync(join(TMP, '.config', 'wtflag'), { recursive: true });

const { findProjectConfig, getEffectiveConfig } = await import('../src/project-config.js');

test.after(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

// --- findProjectConfig ---

test('returns null when no .wtflag.json exists', () => {
  const dir = join(TMP, 'empty-project');
  mkdirSync(dir, { recursive: true });
  assert.equal(findProjectConfig(dir), null);
});

test('finds .wtflag.json in the given directory', () => {
  const dir = join(TMP, 'has-config');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.wtflag.json'), JSON.stringify({ blocked: ['rm'] }));
  const result = findProjectConfig(dir);
  assert.ok(result !== null);
  assert.deepEqual(result.config.blocked, ['rm']);
});

test('walks up to parent directory to find .wtflag.json', () => {
  const parent = join(TMP, 'parent-config');
  const child = join(parent, 'subdir');
  mkdirSync(child, { recursive: true });
  writeFileSync(join(parent, '.wtflag.json'), JSON.stringify({ muted: ['ls'] }));
  const result = findProjectConfig(child);
  assert.ok(result !== null);
  assert.deepEqual(result.config.muted, ['ls']);
});

test('returns null and writes stderr warning on invalid JSON', () => {
  const dir = join(TMP, 'bad-config');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.wtflag.json'), 'not valid json {{{');
  let stderrOutput = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => { stderrOutput += s; return true; };
  const result = findProjectConfig(dir);
  process.stderr.write = origWrite;
  assert.equal(result, null);
  assert.ok(stderrOutput.includes('not valid JSON'));
});

// --- getEffectiveConfig ---

test('returns empty sets/arrays when no config files exist', () => {
  const dir = join(TMP, 'empty-eff');
  mkdirSync(dir, { recursive: true });
  const cfg = getEffectiveConfig(dir);
  assert.ok(cfg.mutelist instanceof Set);
  assert.ok(cfg.blocklist instanceof Set);
  assert.ok(Array.isArray(cfg.blockPatterns));
  assert.equal(cfg.mutelist.size, 0);
  assert.equal(cfg.blocklist.size, 0);
  assert.equal(cfg.blockPatterns.length, 0);
});

test('project blocked entries appear in effective config', () => {
  const dir = join(TMP, 'proj-blocked');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.wtflag.json'), JSON.stringify({ blocked: ['kubectl'] }));
  const cfg = getEffectiveConfig(dir);
  assert.ok(cfg.blocklist.has('kubectl'));
});

test('project muted entries appear in effective config', () => {
  const dir = join(TMP, 'proj-muted');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.wtflag.json'), JSON.stringify({ muted: ['find'] }));
  const cfg = getEffectiveConfig(dir);
  assert.ok(cfg.mutelist.has('find'));
});

test('project block patterns appear in effective config', () => {
  const dir = join(TMP, 'proj-patterns');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.wtflag.json'), JSON.stringify({ blockPatterns: ['rm -rf *'] }));
  const cfg = getEffectiveConfig(dir);
  assert.ok(cfg.blockPatterns.includes('rm -rf *'));
});
