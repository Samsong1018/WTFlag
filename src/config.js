import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.config', 'wtflag');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { mutelist: [], blocked: [], blockPatterns: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { mutelist: [], blocked: [], blockPatterns: [] };
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

// Glob-style pattern matching: * matches anything, case-insensitive substring test.
export function matchesPattern(pattern, command) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i').test(command);
}
