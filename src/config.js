import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.config', 'wtflag');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { mutelist: [], blocked: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { mutelist: [], blocked: [] };
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
  if (config.mutelist.length < before) {
    writeConfig(config);
    return true;
  }
  return false;
}

export function listMutelist() {
  return [...(readConfig().mutelist ?? [])].sort();
}

// --- Block list (prevent execution entirely) ---

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
  if (config.blocked.length < before) {
    writeConfig(config);
    return true;
  }
  return false;
}

export function listBlocklist() {
  return [...(readConfig().blocked ?? [])].sort();
}
