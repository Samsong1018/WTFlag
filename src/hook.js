import net from 'node:net';
import { existsSync } from 'node:fs';
import { explain, renderBlocked, effectiveCommand } from './explain.js';
import { SOCKET_PATH } from './ipc.js';
import { matchesPattern } from './config.js';
import { getEffectiveConfig } from './project-config.js';
import { tokenize } from './tokenizer.js';
import { checkDanger } from './danger.js';
import { appendLog } from './log.js';

export async function runHook() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.stdout.write(raw);
    return;
  }

  const command = data?.tool_input?.command;

  if (command) {
    const config = getEffectiveConfig(process.cwd());

    // 1. Block by command name
    try {
      const segments = tokenize(command).filter(Boolean);
      const hit = segments.find(seg => config.blocklist.has(effectiveCommand(seg)));
      if (hit) {
        const name = effectiveCommand(hit);
        const box = renderBlocked(name, command, false);
        process.stderr.write('\n' + box + '\n\n');
        sendToWatcher(box);
        appendLog({ command, cwd: process.cwd(), blocked: true, blockedBy: name, blockedType: 'command', danger: [] });
        process.exit(2);
      }
    } catch {
      // Never block Claude Code due to wtflag errors
    }

    // 2. Block by pattern
    try {
      const hit = config.blockPatterns.find(p => matchesPattern(p, command));
      if (hit) {
        const box = renderBlocked(hit, command, true);
        process.stderr.write('\n' + box + '\n\n');
        sendToWatcher(box);
        appendLog({ command, cwd: process.cwd(), blocked: true, blockedBy: hit, blockedType: 'pattern', danger: [] });
        process.exit(2);
      }
    } catch {
      // Never block Claude Code due to wtflag errors
    }

    // 3. Explain (skips muted segments)
    try {
      const output = explain(command, { mutelist: config.mutelist });
      if (output) {
        process.stderr.write('\n' + output + '\n\n');
        sendToWatcher(output);
      }
    } catch {
      // Never block Claude Code due to explainer errors
    }

    // 4. Audit log
    try {
      const dangers = checkDanger(command);
      appendLog({
        command,
        cwd: process.cwd(),
        blocked: false,
        danger: dangers.map(d => d.message),
        dangerLevel: dangers[0]?.level ?? null,
      });
    } catch {}
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
