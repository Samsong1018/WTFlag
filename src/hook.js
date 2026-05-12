import net from 'node:net';
import { existsSync } from 'node:fs';
import { explain, renderBlocked, effectiveCommand } from './explain.js';
import { SOCKET_PATH } from './ipc.js';
import { isWindows } from './platform.js';
import { matchesPattern } from './config.js';
import { getEffectiveConfig } from './project-config.js';
import { tokenize } from './tokenizer.js';
import { checkDanger } from './danger.js';
import { appendLog } from './log.js';
import { scanForSecrets, isGitCommit, isGitPush, renderSecretsBlocked, renderSecretsWarning } from './secrets.js';

export async function runHook({ dryRun = false } = {}) {
  const isDryRun = dryRun || process.env.WTFLAG_DRY_RUN === '1';
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
    let config;
    try {
      config = getEffectiveConfig(process.cwd());
    } catch (err) {
      process.stderr.write(`wtflag: config error — ${err.message}\n`);
      config = { mutelist: new Set(), blocklist: new Set(), blockPatterns: [] };
    }

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

    // 3. Secret scan — block git push if secrets found, warn on git commit
    let secretFindings = [];
    try {
      if (isGitCommit(command) || isGitPush(command)) {
        secretFindings = scanForSecrets(command, process.cwd());
        if (secretFindings.length > 0 && isGitPush(command)) {
          const box = renderSecretsBlocked(secretFindings);
          process.stderr.write('\n' + box + '\n\n');
          sendToWatcher(box);
          appendLog({ command, cwd: process.cwd(), blocked: true, blockedBy: 'secrets', blockedType: 'secrets', secretsFound: secretFindings.map(({ file, line, type }) => ({ file, line, type })), danger: [] });
          process.exit(2);
        }
      }
    } catch {
      // Never block Claude Code due to secret scan errors
    }

    // 4. Explain (skips muted segments)
    try {
      const output = explain(command, { mutelist: config.mutelist });
      if (output) {
        process.stderr.write('\n' + output + '\n\n');
        sendToWatcher(output);
      }
    } catch {
      // Never block Claude Code due to explainer errors
    }

    // 5. Secrets warning for git commit (shown after explain so it's prominent at the bottom)
    if (secretFindings.length > 0) {
      try {
        const box = renderSecretsWarning(secretFindings);
        process.stderr.write('\n' + box + '\n\n');
        sendToWatcher(box);
      } catch {}
    }

    // 6. Dry-run — show explanation then block execution
    if (isDryRun) {
      const msg = '[wtflag] Dry-run mode is active — command blocked. Unset WTFLAG_DRY_RUN to allow.\n';
      process.stderr.write(msg);
      try {
        appendLog({ command, cwd: process.cwd(), blocked: true, blockedBy: 'dry-run', blockedType: 'dry-run', danger: [] });
      } catch {}
      process.exit(2);
    }

    // 7. Audit log
    try {
      const dangers = checkDanger(command);
      appendLog({
        command,
        cwd: process.cwd(),
        blocked: false,
        danger: dangers.map(d => d.message),
        dangerLevel: dangers[0]?.level ?? null,
        ...(secretFindings.length > 0 && { secretsFound: secretFindings.map(({ file, line, type }) => ({ file, line, type })) }),
      });
    } catch {}
  }

  process.stdout.write(JSON.stringify(data));
}

function sendToWatcher(output) {
  // On Windows, named pipes can't be checked with existsSync — just try to connect.
  // Wrap in try/catch because createConnection can throw synchronously on Windows
  // if the pipe doesn't exist before the error handler is attached.
  if (!isWindows && !existsSync(SOCKET_PATH)) return;
  try {
    const socket = net.createConnection(SOCKET_PATH);
    const timer = setTimeout(() => socket.destroy(), 300);
    socket.on('connect', () => { clearTimeout(timer); socket.end(output); });
    socket.on('error', () => clearTimeout(timer));
  } catch {
    // Watcher not running — silently skip
  }
}
