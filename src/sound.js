import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isWindows } from './platform.js';

const LINUX_SOUNDS = {
  stop: '/usr/share/sounds/freedesktop/stereo/complete.oga',
  notification: '/usr/share/sounds/freedesktop/stereo/message-new-instant.oga',
};

const MAC_SOUNDS = {
  stop: 'Glass',
  notification: 'Ping',
};

function tryExec(cmd, args) {
  try {
    execFileSync(cmd, args, { timeout: 3000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function playSound(event = 'notification') {
  if (isWindows) {
    const freq = event === 'stop' ? 600 : 900;
    tryExec('powershell', ['-c', `[console]::beep(${freq},250)`]);
    return;
  }

  if (process.platform === 'darwin') {
    const name = MAC_SOUNDS[event] ?? MAC_SOUNDS.notification;
    tryExec('afplay', [`/System/Library/Sounds/${name}.aiff`]);
    return;
  }

  // Linux: try paplay then ffplay, fall back to terminal bell
  const file = LINUX_SOUNDS[event] ?? LINUX_SOUNDS.notification;
  if (existsSync(file)) {
    if (tryExec('paplay', [file])) return;
    if (tryExec('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file])) return;
  }

  process.stdout.write('\x07');
}
