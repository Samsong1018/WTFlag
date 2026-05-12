import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readSettings, writeSettings } from './settings.js';

const CLAUDE_MD_PATH = () => join(homedir(), '.claude', 'CLAUDE.md');
const ALLOW_ALL_ENTRY = 'Bash';
const PERMISSIONS_ALLOW_ENTRY = 'Bash';

const AUTONOMY_BLOCK = `\n<!-- wtflag:autonomy:start -->\n## Autonomy (managed by wtflag)\nOperate autonomously. Run bash commands without asking for confirmation first, including git operations, npm, file reads and writes, and standard development tasks. Only pause for genuinely irreversible system-level operations (partition formatting, credential rotation, etc).\n<!-- wtflag:autonomy:end -->\n`;

function readClaudeMd() {
  const p = CLAUDE_MD_PATH();
  if (!existsSync(p)) return '';
  try { return readFileSync(p, 'utf8'); }
  catch { return ''; }
}

function writeClaudeMd(content) {
  const dir = join(homedir(), '.claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CLAUDE_MD_PATH(), content, 'utf8');
}

function injectAutonomy() {
  const content = readClaudeMd();
  if (content.includes('<!-- wtflag:autonomy:start -->')) return false;
  writeClaudeMd(content + AUTONOMY_BLOCK);
  return true;
}

function removeAutonomy() {
  const content = readClaudeMd();
  if (!content.includes('<!-- wtflag:autonomy:start -->')) return false;
  const cleaned = content.replace(/\n<!-- wtflag:autonomy:start -->[\s\S]*?<!-- wtflag:autonomy:end -->\n/g, '');
  writeClaudeMd(cleaned);
  return true;
}

function cmdEntry(cmd) {
  return `Bash(command:${cmd.toLowerCase().trim()}*)`;
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
  settings.permissions ??= {};
  settings.permissions.allow ??= [];

  const alreadyInTools = settings.allowedTools.includes(ALLOW_ALL_ENTRY);
  const alreadyInPerms = settings.permissions.allow.includes(PERMISSIONS_ALLOW_ENTRY);
  const alreadySet = alreadyInTools && alreadyInPerms;

  if (!alreadyInTools) settings.allowedTools.push(ALLOW_ALL_ENTRY);
  if (!alreadyInPerms) settings.permissions.allow.push(PERMISSIONS_ALLOW_ENTRY);
  if (!alreadySet) writeSettings(settings);

  injectAutonomy();
  return !alreadySet;
}

export function disallowAll() {
  const settings = readSettings();
  let removed = false;

  if (settings.allowedTools?.length) {
    const before = settings.allowedTools.length;
    settings.allowedTools = settings.allowedTools.filter(e => e !== ALLOW_ALL_ENTRY);
    if (settings.allowedTools.length < before) removed = true;
  }

  if (settings.permissions?.allow?.length) {
    const before = settings.permissions.allow.length;
    settings.permissions.allow = settings.permissions.allow.filter(e => e !== PERMISSIONS_ALLOW_ENTRY);
    if (settings.permissions.allow.length < before) removed = true;
  }

  if (removed) writeSettings(settings);
  removeAutonomy();
  return removed;
}

// Returns only the entries wtflag manages (Bash allow-all or Bash command patterns).
export function listAllowed() {
  const tools = readSettings().allowedTools ?? [];
  return tools.filter(e => e === ALLOW_ALL_ENTRY || e.startsWith('Bash(command:'));
}
