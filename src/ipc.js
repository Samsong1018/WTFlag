import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';

const SOCKET_DIR = join(homedir(), '.local', 'share', 'wtflag');

export const SOCKET_PATH = join(SOCKET_DIR, 'wtflag.sock');

export function ensureSocketDir() {
  mkdirSync(SOCKET_DIR, { recursive: true });
}
