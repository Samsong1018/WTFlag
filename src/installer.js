import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const HOOK_COMMAND = 'NODE_NO_WARNINGS=1 wtflag hook';
const HOOK_COMMAND_LEGACY = 'wtflag hook';

export function install() {
  const settings = readSettings();

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  const findEntry = (cmd) => settings.hooks.PreToolUse.some(
    h => Array.isArray(h.hooks) && h.hooks.some(e => e.command === cmd)
  );

  if (findEntry(HOOK_COMMAND)) {
    console.log('wtflag is already installed.');
    return;
  }

  // Migrate legacy install to suppress the SQLite experimental warning
  if (findEntry(HOOK_COMMAND_LEGACY)) {
    for (const h of settings.hooks.PreToolUse) {
      if (Array.isArray(h.hooks)) {
        for (const e of h.hooks) {
          if (e.command === HOOK_COMMAND_LEGACY) e.command = HOOK_COMMAND;
        }
      }
    }
    writeSettings(settings);
    console.log('✓ Hook upgraded. Restart Claude Code to activate.');
    return;
  }

  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  });
  writeSettings(settings);
  console.log('✓ Hook installed. Restart Claude Code to activate.');
}

export function uninstall() {
  const settings = readSettings();

  if (!settings.hooks?.PreToolUse?.length) {
    console.log('No hook found.');
    return;
  }

  const before = settings.hooks.PreToolUse.length;
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    h => !(Array.isArray(h.hooks) && h.hooks.some(e =>
      e.command === HOOK_COMMAND || e.command === HOOK_COMMAND_LEGACY
    ))
  );

  if (settings.hooks.PreToolUse.length === before) {
    console.log('No wtflag hook found.');
    return;
  }

  writeSettings(settings);
  console.log('✓ Hook removed.');
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
