import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function settingsPath() {
  return join(homedir(), '.claude', 'settings.json');
}

export function readSettings() {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  try { return JSON.parse(raw); }
  catch {
    throw new Error(
      `~/.claude/settings.json is not valid JSON — please fix it before running wtflag.\n` +
      `  Path: ${path}`
    );
  }
}

export function writeSettings(settings) {
  const dir = join(homedir(), '.claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
}
