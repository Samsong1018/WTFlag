import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const ALLOW_ALL_ENTRY = 'Bash';

function cmdEntry(cmd) {
  return `Bash(command:${cmd.toLowerCase().trim()}*)`;
}

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}

function writeSettings(settings) {
  const dir = join(homedir(), '.claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

export function allowCommand(cmd) {
  const settings = readSettings();
  settings.allowedTools ??= [];
  const entry = cmdEntry(cmd);
  if (!settings.allowedTools.includes(entry)) {
    settings.allowedTools.push(entry);
    writeSettings(settings);
  }
  return entry;
}

export function disallowCommand(cmd) {
  const settings = readSettings();
  if (!settings.allowedTools?.length) return false;
  const entry = cmdEntry(cmd);
  const before = settings.allowedTools.length;
  settings.allowedTools = settings.allowedTools.filter(e => e !== entry);
  if (settings.allowedTools.length < before) {
    writeSettings(settings);
    return true;
  }
  return false;
}

export function allowAll() {
  const settings = readSettings();
  settings.allowedTools ??= [];
  if (settings.allowedTools.includes(ALLOW_ALL_ENTRY)) return false;
  settings.allowedTools.push(ALLOW_ALL_ENTRY);
  writeSettings(settings);
  return true;
}

export function disallowAll() {
  const settings = readSettings();
  if (!settings.allowedTools?.length) return false;
  const before = settings.allowedTools.length;
  settings.allowedTools = settings.allowedTools.filter(e => e !== ALLOW_ALL_ENTRY);
  if (settings.allowedTools.length < before) {
    writeSettings(settings);
    return true;
  }
  return false;
}

// Returns only the entries wtflag manages (Bash allow-all or Bash command patterns).
export function listAllowed() {
  const tools = readSettings().allowedTools ?? [];
  return tools.filter(e => e === ALLOW_ALL_ENTRY || e.startsWith('Bash(command:'));
}
