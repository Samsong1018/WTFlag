import { join } from 'node:path';
import { homedir } from 'node:os';

export const isWindows = process.platform === 'win32';

// Data dir: ~/.local/share/wtflag on Unix, %LOCALAPPDATA%\wtflag on Windows
export const DATA_DIR = isWindows
  ? join(process.env.LOCALAPPDATA || homedir(), 'wtflag')
  : join(homedir(), '.local', 'share', 'wtflag');

// Config dir: ~/.config/wtflag on Unix, %APPDATA%\wtflag on Windows
export const CONFIG_DIR = isWindows
  ? join(process.env.APPDATA || homedir(), 'wtflag')
  : join(homedir(), '.config', 'wtflag');

// IPC: named pipe on Windows, Unix domain socket on Linux/macOS
export const SOCKET_PATH = isWindows
  ? '\\\\.\\pipe\\wtflag'
  : join(DATA_DIR, 'wtflag.sock');

// Hook command written into Claude Code's settings.json
// Windows: omit the inline env var — cmd.exe and PowerShell use different syntax,
// and Node 22+ no longer emits the sqlite experimental warning anyway.
export const HOOK_COMMAND = isWindows
  ? 'wtflag hook'
  : 'NODE_NO_WARNINGS=1 wtflag hook';

export const HOOK_COMMAND_LEGACY = 'wtflag hook';
