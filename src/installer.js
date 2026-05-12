import { HOOK_COMMAND, HOOK_COMMAND_LEGACY, isWindows } from './platform.js';
import { readSettings, writeSettings } from './settings.js';

const PREFIX = isWindows ? '' : 'NODE_NO_WARNINGS=1 ';
const SOUND_CMD_STOP = `${PREFIX}wtflag sound play stop`;
const SOUND_CMD_NOTIF = `${PREFIX}wtflag sound play notification`;

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

const hasSoundHook = (hooks, cmd) =>
  Array.isArray(hooks) && hooks.some(h => Array.isArray(h.hooks) && h.hooks.some(e => e.command === cmd));

export function installSoundHooks() {
  const settings = readSettings();
  settings.hooks ??= {};

  settings.hooks.Stop ??= [];
  if (!hasSoundHook(settings.hooks.Stop, SOUND_CMD_STOP)) {
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: SOUND_CMD_STOP }] });
  }

  settings.hooks.Notification ??= [];
  if (!hasSoundHook(settings.hooks.Notification, SOUND_CMD_NOTIF)) {
    settings.hooks.Notification.push({ hooks: [{ type: 'command', command: SOUND_CMD_NOTIF }] });
  }

  writeSettings(settings);
}

export function uninstallSoundHooks() {
  const settings = readSettings();
  if (!settings.hooks) return;

  const isSoundEntry = (h) =>
    Array.isArray(h.hooks) && h.hooks.some(e =>
      e.command === SOUND_CMD_STOP || e.command === SOUND_CMD_NOTIF
    );

  if (settings.hooks.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(h => !isSoundEntry(h));
  }
  if (settings.hooks.Notification) {
    settings.hooks.Notification = settings.hooks.Notification.filter(h => !isSoundEntry(h));
  }

  writeSettings(settings);
}

export function isSoundHookInstalled() {
  const settings = readSettings();
  return (
    hasSoundHook(settings.hooks?.Stop, SOUND_CMD_STOP) &&
    hasSoundHook(settings.hooks?.Notification, SOUND_CMD_NOTIF)
  );
}

export function isHookInstalled() {
  try {
    const settings = readSettings();
    return settings.hooks?.PreToolUse?.some(
      h => Array.isArray(h.hooks) && h.hooks.some(
        e => e.command === HOOK_COMMAND || e.command === HOOK_COMMAND_LEGACY
      )
    ) ?? false;
  } catch {
    return false;
  }
}
