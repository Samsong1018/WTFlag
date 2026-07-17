import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './platform.js';

const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { mutelist: [], blocked: [], blockPatterns: [] };
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  try { return JSON.parse(raw); }
  catch {
    throw new Error(
      `~/.config/wtflag/config.json is not valid JSON — please fix or delete it.\n` +
      `  Path: ${CONFIG_PATH}`
    );
  }
}

function writeConfig(config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// --- Mute list (suppress explanations only) ---

export function getMutelist() {
  return new Set((readConfig().mutelist ?? []).map(c => c.toLowerCase()));
}

export function addToMutelist(cmd) {
  const config = readConfig();
  config.mutelist ??= [];
  const normalized = cmd.toLowerCase().trim();
  if (!config.mutelist.map(c => c.toLowerCase()).includes(normalized)) {
    config.mutelist.push(normalized);
    writeConfig(config);
  }
  return normalized;
}

export function removeFromMutelist(cmd) {
  const config = readConfig();
  config.mutelist ??= [];
  const normalized = cmd.toLowerCase().trim();
  const before = config.mutelist.length;
  config.mutelist = config.mutelist.filter(c => c.toLowerCase() !== normalized);
  if (config.mutelist.length < before) { writeConfig(config); return true; }
  return false;
}

export function listMutelist() {
  return [...(readConfig().mutelist ?? [])].sort();
}

export function setMutelist(cmds) {
  const config = readConfig();
  config.mutelist = cmds.map(c => c.toLowerCase().trim());
  writeConfig(config);
}

// --- Block list (prevent execution by command name) ---

export function getBlocklist() {
  return new Set((readConfig().blocked ?? []).map(c => c.toLowerCase()));
}

export function addToBlocklist(cmd) {
  const config = readConfig();
  config.blocked ??= [];
  const normalized = cmd.toLowerCase().trim();
  if (!config.blocked.map(c => c.toLowerCase()).includes(normalized)) {
    config.blocked.push(normalized);
    writeConfig(config);
  }
  return normalized;
}

export function removeFromBlocklist(cmd) {
  const config = readConfig();
  config.blocked ??= [];
  const normalized = cmd.toLowerCase().trim();
  const before = config.blocked.length;
  config.blocked = config.blocked.filter(c => c.toLowerCase() !== normalized);
  if (config.blocked.length < before) { writeConfig(config); return true; }
  return false;
}

export function listBlocklist() {
  return [...(readConfig().blocked ?? [])].sort();
}

export function setBlocklist(cmds) {
  const config = readConfig();
  config.blocked = cmds.map(c => c.toLowerCase().trim());
  writeConfig(config);
}

// --- Block patterns (prevent execution by raw command pattern) ---

export function getBlockPatterns() {
  return [...(readConfig().blockPatterns ?? [])];
}

export function addBlockPattern(pattern) {
  const config = readConfig();
  config.blockPatterns ??= [];
  if (!config.blockPatterns.includes(pattern)) {
    config.blockPatterns.push(pattern);
    writeConfig(config);
  }
  return pattern;
}

export function removeBlockPattern(pattern) {
  const config = readConfig();
  config.blockPatterns ??= [];
  const before = config.blockPatterns.length;
  config.blockPatterns = config.blockPatterns.filter(p => p !== pattern);
  if (config.blockPatterns.length < before) { writeConfig(config); return true; }
  return false;
}

export function listBlockPatterns() {
  return [...(readConfig().blockPatterns ?? [])];
}

export function setBlockPatterns(patterns) {
  const config = readConfig();
  config.blockPatterns = [...patterns];
  writeConfig(config);
}

// Common GNU long-form flags mapped to their short-form equivalent, so a pattern written
// with one style still matches a command written with the other (`rm --recursive --force`
// vs `rm -rf`). Deliberately narrow — only the handful of flags relevant to destructive
// commands wtflag ships patterns for.
const LONG_TO_SHORT_FLAGS = {
  '--recursive': '-r',
  '--force': '-f',
  '--all': '-a',
  '--verbose': '-v',
  '--interactive': '-i',
  '--quiet': '-q',
};

// Reuses the tokenizer's own "combined short flags are 2-3 letters" convention (see
// tokenizer.js) to canonicalize flag order/shape before comparing: `-rf`, `-fr`, and
// `-r -f` (as separate tokens) all normalize to the same sorted form.
const COMBINED_SHORT_FLAG = /^-[a-zA-Z]{2,3}$/;
const SINGLE_SHORT_FLAG = /^-[a-zA-Z]$/;

// Collapses whitespace runs to a single space and canonicalizes flag shape/order so that
// trivial reformatting (double spaces, split flags, long-form flags) can't bypass a
// pattern written for the equivalent short/combined form.
function normalizeForMatch(str) {
  const collapsed = str.trim().replace(/\s+/g, ' ');
  if (!collapsed) return collapsed;

  const words = collapsed.split(' ').map(w => LONG_TO_SHORT_FLAGS[w.toLowerCase()] ?? w);

  const merged = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (SINGLE_SHORT_FLAG.test(w)) {
      // Merge a run of consecutive standalone single-letter flags: "-r -f" → "-fr"
      const letters = [w.slice(1)];
      i++;
      while (i < words.length && SINGLE_SHORT_FLAG.test(words[i])) {
        letters.push(words[i].slice(1));
        i++;
      }
      merged.push('-' + letters.sort().join(''));
      continue;
    }
    if (COMBINED_SHORT_FLAG.test(w)) {
      // Canonicalize an already-combined short-flag cluster: "-rf" and "-fr" → same form
      merged.push('-' + w.slice(1).split('').sort().join(''));
      i++;
      continue;
    }
    merged.push(w);
    i++;
  }
  return merged.join(' ');
}

// Shell operators that should tolerate zero-or-more surrounding whitespace when compiled
// into the pattern regex — e.g. `curl * | bash` must still match `curl url|bash`.
const OPERATOR_SPLIT = /(\|\||&&|;|\|)/;

function escapeRegexLiteral(str) {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function compilePatternRegex(normPattern) {
  const parts = normPattern.split(OPERATOR_SPLIT);
  const compiled = parts.map(part => {
    if (part === '||' || part === '&&' || part === ';' || part === '|') {
      return `\\s*${escapeRegexLiteral(part)}\\s*`;
    }
    const trimmed = part.replace(/^ +| +$/g, '');
    return escapeRegexLiteral(trimmed).replace(/\*/g, '.*');
  });
  return new RegExp(compiled.join(''), 'i');
}

// Glob-style pattern matching: * matches anything, case-insensitive substring test.
// Both the pattern and the command are normalized first (whitespace collapsed, flags
// canonicalized) so `rm  -rf`, `rm -r -f`, and `rm --recursive --force` all match a
// pattern written as `rm -rf`, and the compiled regex tolerates missing whitespace
// around pipes/operators so `curl url|bash` still matches `curl * | bash`.
export function matchesPattern(pattern, command) {
  const normPattern = normalizeForMatch(pattern);
  const normCommand = normalizeForMatch(command);
  return compilePatternRegex(normPattern).test(normCommand);
}

// --- Sound ---

export function isSoundEnabled() {
  return readConfig().sound === true;
}

export function setSoundEnabled(enabled) {
  const config = readConfig();
  config.sound = enabled;
  writeConfig(config);
}
