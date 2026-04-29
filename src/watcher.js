import net from 'node:net';
import { existsSync, rmSync } from 'node:fs';
import chalk from 'chalk';
import { SOCKET_PATH, ensureSocketDir } from './ipc.js';

export function startWatcher() {
  ensureSocketDir();

  // Remove stale socket left by a previous crash
  if (existsSync(SOCKET_PATH)) rmSync(SOCKET_PATH);

  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', chunk => { buf += chunk; });
    conn.on('end', () => {
      if (buf.trim()) process.stdout.write('\n' + buf + '\n');
    });
  });

  server.on('error', (err) => {
    process.stderr.write(`wtflag watcher error: ${err.message}\n`);
    cleanup(1);
  });

  server.listen(SOCKET_PATH, () => {
    process.stdout.write(
      chalk.dim('wtflag watcher — explanations will appear here\n') +
      chalk.dim('Ctrl+C to stop\n\n')
    );
  });

  const cleanup = (code = 0) => {
    server.close();
    try { if (existsSync(SOCKET_PATH)) rmSync(SOCKET_PATH); } catch {}
    process.exit(code);
  };

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
}
