import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.local', 'share', 'wtflag');
export const LOG_PATH = join(LOG_DIR, 'log.jsonl');

export function appendLog(entry) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {
    // Never let logging errors affect the hook
  }
}

export function readLog() {
  if (!existsSync(LOG_PATH)) return [];
  try {
    return readFileSync(LOG_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export function clearLog() {
  if (existsSync(LOG_PATH)) writeFileSync(LOG_PATH, '');
}
