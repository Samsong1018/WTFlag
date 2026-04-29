import { explain } from './explain.js';

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
      if (output) process.stderr.write('\n' + output + '\n\n');
    } catch {
      // Never block Claude Code due to explainer errors
    }
  }

  process.stdout.write(JSON.stringify(data));
}
