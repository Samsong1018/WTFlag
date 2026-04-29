import net from 'node:net';
import { existsSync } from 'node:fs';
import { explain } from './explain.js';
import { SOCKET_PATH } from './ipc.js';

export async function runHook() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Can't parse — pass through untouched so Claude Code isn't blocked
    process.stdout.write(raw);
    return;
  }

  const command = data?.tool_input?.command;

  if (command) {
    try {
      const output = explain(command);
      if (output) {
        // Always write to stderr as fallback (visible in ctrl-o)
        process.stderr.write('\n' + output + '\n\n');
        // Send to watcher terminal if running
        sendToWatcher(output);
      }
    } catch {
      // Never block Claude Code due to explainer errors
    }
  }

  process.stdout.write(JSON.stringify(data));
}

function sendToWatcher(output) {
  if (!existsSync(SOCKET_PATH)) return;
  const socket = net.createConnection(SOCKET_PATH);
  const timer = setTimeout(() => socket.destroy(), 300);
  socket.on('connect', () => { clearTimeout(timer); socket.end(output); });
  socket.on('error', () => clearTimeout(timer));
}
