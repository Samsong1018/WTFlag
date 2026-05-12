import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './platform.js';

const PROFILES_DIR = join(CONFIG_DIR, 'profiles');

export const BUILTIN = {
  safe: {
    description: 'Blocks destructive commands and dangerous patterns',
    blocked: ['dd', 'mkfs', 'fdisk', 'parted'],
    blockPatterns: [
      'rm -rf', 'rm -fr',
      'git push --force', 'git push -f',
      'curl * | bash', 'curl * | sh',
      'wget * | bash', 'wget * | sh',
      'chmod -R 777', 'chmod 777 /',
    ],
    muted: [],
  },
  dev: {
    description: 'Mutes noisy read-only commands for active development',
    blocked: [],
    blockPatterns: [],
    muted: ['grep', 'find', 'ls', 'cat', 'echo', 'pwd', 'which', 'wc'],
  },
  readonly: {
    description: 'Blocks all write operations — safe for auditing or code review',
    blocked: ['rm', 'mv', 'cp', 'touch', 'mkdir', 'rmdir', 'chmod', 'chown', 'ln', 'truncate'],
    blockPatterns: [
      'git commit', 'git push', 'git reset --hard',
      'npm install', 'pip install',
      'apt install', 'apt-get install',
    ],
    muted: [],
  },
};

export function getProfile(name) {
  if (BUILTIN[name]) return BUILTIN[name];
  try { validateProfileName(name); } catch { return null; }
  const path = join(PROFILES_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function validateProfileName(name) {
  if (!name || typeof name !== 'string') throw new Error('Profile name must be a non-empty string.');
  if (/[/\\]/.test(name) || name.includes('..')) throw new Error(`Invalid profile name '${name}' — must not contain path separators or '..'.`);
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid profile name '${name}' — use only letters, numbers, hyphens, and underscores.`);
}

export function saveProfile(name, data) {
  validateProfileName(name);
  if (BUILTIN[name]) throw new Error(`'${name}' is a built-in profile and cannot be overwritten.`);
  if (!existsSync(PROFILES_DIR)) mkdirSync(PROFILES_DIR, { recursive: true });
  writeFileSync(join(PROFILES_DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}

export function deleteProfile(name) {
  if (BUILTIN[name]) return false;
  try { validateProfileName(name); } catch { return false; }
  const path = join(PROFILES_DIR, `${name}.json`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

export function listProfiles() {
  const user = existsSync(PROFILES_DIR)
    ? readdirSync(PROFILES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    : [];
  return { builtin: BUILTIN, user };
}
