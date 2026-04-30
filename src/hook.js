import net from 'node:net';
import { existsSync } from 'node:fs';
import { explain, renderBlocked, effectiveCommand } from './explain.js';
import { SOCKET_PATH } from './ipc.js';
import { getMutelist, getBlocklist } from './config.js';
import { tokenize } from './tokenizer.js';

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
    // Check block list first — exit(2) cancels the tool call and feeds
    // the stderr message back to Claude as the reason it was blocked.
    try {
      const blocklist = getBlocklist();
      if (blocklist.size > 0) {
        const segments = tokenize(command).filter(Boolean);
        const hit = segments.find(seg => blocklist.has(effectiveCommand(seg)));
        if (hit) {
          const name = effectiveCommand(hit);
          const box = renderBlocked(name, command);
          process.stderr.write('\n' + box + '\n\n');
          sendToWatcher(box);
          process.exit(2);
        }
      }
    } catch {
      // Never block Claude Code due to wtflag errors
    }

    // Show explanation (skipping any muted segments)
    try {
      const output = explain(command, { mutelist: getMutelist() });
      if (output) {
        process.stderr.write('\n' + output + '\n\n');
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
