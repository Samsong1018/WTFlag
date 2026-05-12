import { homedir } from 'node:os';

export function generateReport(entries) {
  if (!entries.length) return 'No log entries to report.';

  const total = entries.length;
  const blocked = entries.filter(e => e.blocked).length;
  const dangerCount = entries.filter(e => e.dangerLevel === 'danger').length;
  const warningCount = entries.filter(e => e.dangerLevel === 'warning').length;

  // Command frequency — key on the first word (base command)
  const cmdFreq = new Map();
  for (const e of entries) {
    if (!e.command) continue;
    const base = e.command.trim().split(/\s+/)[0];
    cmdFreq.set(base, (cmdFreq.get(base) ?? 0) + 1);
  }
  const topCmds = [...cmdFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Directory frequency
  const dirFreq = new Map();
  for (const e of entries) {
    if (!e.cwd) continue;
    const dir = e.cwd.replace(homedir(), '~');
    dirFreq.set(dir, (dirFreq.get(dir) ?? 0) + 1);
  }
  const topDirs = [...dirFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Activity per day for the last 14 days
  const now = new Date();
  const buckets = new Map();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    buckets.set(key, 0);
  }
  for (const e of entries) {
    if (!e.ts) continue;
    const d = new Date(e.ts);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }
  const maxDay = Math.max(...buckets.values(), 1);

  const hr = '─'.repeat(56);
  const lines = [];
  lines.push(`${hr}`);
  lines.push(`  wtflag log report`);
  lines.push(hr);
  lines.push('');
  lines.push('  Overview');
  lines.push(`    Total commands : ${total}`);
  lines.push(`    Blocked        : ${blocked}`);
  lines.push(`    Danger events  : ${dangerCount}`);
  lines.push(`    Warnings       : ${warningCount}`);

  if (topCmds.length) {
    lines.push('');
    lines.push('  Top commands');
    for (const [cmd, count] of topCmds) {
      lines.push(`    ${String(count).padStart(5)}×  ${cmd}`);
    }
  }

  if (topDirs.length) {
    lines.push('');
    lines.push('  Active directories');
    for (const [dir, count] of topDirs) {
      lines.push(`    ${String(count).padStart(5)}×  ${dir}`);
    }
  }

  lines.push('');
  lines.push('  Activity (last 14 days)');
  for (const [day, count] of buckets) {
    const barLen = Math.round((count / maxDay) * 24);
    const bar = '█'.repeat(barLen).padEnd(24);
    lines.push(`    ${day}  ${bar}  ${count}`);
  }

  lines.push('');
  lines.push(hr);
  return lines.join('\n');
}
