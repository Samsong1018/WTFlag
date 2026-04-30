import { mkdirSync } from 'node:fs';
import { isWindows, DATA_DIR, SOCKET_PATH } from './platform.js';

export { SOCKET_PATH };

export function ensureSocketDir() {
  if (!isWindows) mkdirSync(DATA_DIR, { recursive: true });
}
