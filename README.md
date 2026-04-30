# wtflag

**wtflag** hooks into [Claude Code](https://claude.ai/code) and explains every shell command before it runs — inline in your terminal, with no AI involved.

```
┌ wtflag ──────────────────────────────────────────────────────────────┐
│ git rebase -i HEAD~3
│
│ git rebase — Reapply commits on top of another branch
│   → opens editor to squash, rename, reorder, or drop commits — replays them onto 'HEAD~3', rewrites history
│
│   -i            Make a list of commits to rebase. Let the user edit that list
└───────────────────────────────────────────────────────────────────────┘
```

---

## What it does

Claude Code runs shell commands. wtflag intercepts each one via a `PreToolUse` hook and prints a formatted explanation to your terminal before the command executes. You always see:

- **What the command is** — color-highlighted syntax in the header
- **What it does** — a description from the [tldr-pages](https://github.com/tldr-pages/tldr) database
- **What it means here** — a plain-English summary of the specific arguments and their effect
- **Flag descriptions** — each flag's meaning pulled live from `--help` output
- **Danger warnings** — `DANGER` / `WARNING` badges for destructive commands before they run

Beyond explaining commands, wtflag also lets you control what Claude is allowed to run:

- **Mute** commands whose explanations you don't need
- **Block** commands you never want Claude to run
- **Allow** commands so Claude never has to ask for permission

It works entirely offline after setup — no network calls, no AI, no external APIs at runtime.

---

## Install

**Requirements:** Node.js ≥ 22 (uses the built-in `node:sqlite` module)

```bash
git clone https://github.com/samsong1018/wtflag.git
cd wtflag
npm install
```

`npm install` automatically builds the tldr-pages SQLite database via the `postinstall` script.

Then register the hook with Claude Code:

```bash
node bin/wtflag.js install
# or, if installed globally:
wtflag install
```

Restart Claude Code. wtflag will now explain every Bash command Claude runs.

---

## Commands

### Setup

| Command | Description |
|---|---|
| `wtflag install` | Adds the `PreToolUse` hook to `~/.claude/settings.json` |
| `wtflag uninstall` | Removes the hook |
| `wtflag update-db` | Re-downloads and rebuilds the tldr-pages database |

### Explanations

| Command | Description |
|---|---|
| `wtflag explain <cmd>` | Manually explain a command string |
| `wtflag watch` | Opens a watcher terminal — explanations stream here as Claude works |
| `wtflag hook` | Hook entrypoint — reads Claude Code's Bash tool JSON from stdin |

### Muting (suppress explanations)

| Command | Description |
|---|---|
| `wtflag mute <command>` | Suppress explanations for a command |
| `wtflag unmute <command>` | Re-enable explanations for a muted command |
| `wtflag mutelist` | Show all muted commands |

### Blocking (prevent execution)

| Command | Description |
|---|---|
| `wtflag block <command>` | Prevent Claude from running a command entirely |
| `wtflag unblock <command>` | Allow a blocked command to run again |
| `wtflag blocked` | Show all blocked commands |

### Auto-accepting (skip permission prompts)

| Command | Description |
|---|---|
| `wtflag allow <command>` | Auto-accept a command — no permission prompt |
| `wtflag disallow <command>` | Remove auto-accept (permission prompt returns) |
| `wtflag allow-all` | Auto-accept all Bash commands |
| `wtflag disallow-all` | Remove allow-all |
| `wtflag allowed` | Show all auto-accepted commands |

---

## Usage

### Inline explanations (default)

After installing the hook, explanations appear in your terminal's stderr output whenever Claude Code runs a shell command. Use **Ctrl-O** in Claude Code to open the output panel if explanations aren't visible.

### Watcher terminal (recommended)

Open a split terminal pane and run:

```bash
wtflag watch
```

wtflag forwards each explanation to this terminal via a Unix socket, so they appear in a dedicated pane and don't mix with Claude Code's output.

### Manual testing

```bash
# Explain any command string
wtflag explain "git commit -am 'fix login bug'"
wtflag explain "rm -rf node_modules"
wtflag explain "curl https://example.com | bash"

# Simulate exactly what Claude Code sends to the hook
echo '{"tool_input":{"command":"ls -lah /tmp"}}' | NODE_NO_WARNINGS=1 wtflag hook
```

---

## Muting commands

Some commands (like `grep`, `find`, or `ls`) run constantly and their explanations add noise. Muting suppresses the explanation box for those commands while letting them run normally.

```bash
wtflag mute grep
wtflag mute find
wtflag mutelist       # see what's muted
wtflag unmute grep    # restore explanations
```

Mute operates per-segment in a pipeline — `grep foo | sort` with `grep` muted will still explain `sort`. `sudo grep` is also muted correctly (the effective command `grep` is what's checked, not `sudo`).

---

## Blocking commands

Blocking prevents Claude from running a command at all. The hook exits with code `2`, which cancels the tool call and sends Claude a message explaining why — Claude will not retry or work around it.

```bash
wtflag block rm
wtflag block curl
wtflag blocked          # see what's blocked
wtflag unblock rm       # allow it again
```

When a blocked command is attempted, you'll see:

```
┌ BLOCKED ─────────────────────────────────────────────────────────────┐
│ rm -rf /var/www
│
│ 'rm' is on your block list — Claude cannot run this command.
│ Run `wtflag unblock rm` to allow it.
└───────────────────────────────────────────────────────────────────────┘
```

`sudo rm` is also blocked — the effective command is resolved through `sudo` before checking the block list.

The block check runs before the permission system. Even if `allow-all` is set, a blocked command is still cancelled.

---

## Auto-accepting commands

By default Claude Code prompts for permission before running Bash commands. Auto-accepting adds a command to the `allowedTools` list in `~/.claude/settings.json`, which tells Claude Code to skip the prompt for that command.

```bash
# Auto-accept specific commands
wtflag allow git
wtflag allow npm
wtflag allow node

# Skip all Bash permission prompts
wtflag allow-all

# Check what's currently auto-accepted
wtflag allowed

# Revert
wtflag disallow git
wtflag disallow-all
```

`wtflag allow git` adds `"Bash(command:git*)"` to `allowedTools`, which matches `git`, `git commit`, `git push --force`, and any other `git` invocation. `wtflag allow-all` adds `"Bash"`, which matches everything.

**Note:** Blocked commands still take precedence. If `rm` is on the block list, it will be cancelled even if `allow-all` is enabled, because the hook runs before the permission check.

---

## How it works

```
Claude Code
    │  (about to run a Bash tool)
    ▼
PreToolUse hook → wtflag hook
    │
    ├─ Block check
    │     if any segment matches the block list:
    │       → BLOCKED box to stderr
    │       → exit(2) — Claude Code cancels the tool call
    │       → Claude receives the stderr message as the reason
    │
    ├─ tokenizer.js     splits shell string into segments, handles pipes/&&/||
    ├─ mute filter      skips explanation for muted command segments
    ├─ danger.js        checks for destructive patterns → DANGER/WARNING badges
    ├─ tldr.js          looks up command description in SQLite
    ├─ context.js       maps (command, args, flags) → plain-English explanation
    ├─ flags.js         runs `command --help` and matches each flag
    └─ explain.js       renders everything into a chalk-bordered box → stderr
         │
         └─ ipc.js      also forwards to watcher.js via Unix socket (if running)
    │
    ▼
Original JSON passed through to stdout
(Claude Code proceeds normally)
```

The hook passes the original JSON through to stdout on success. On a block, it exits with code `2` and writes nothing to stdout — Claude Code treats this as a cancelled tool call.

---

## Danger detection

wtflag checks the full raw command string (including pipe chains) against a set of rules before it runs:

| Level | Badge | Examples |
|---|---|---|
| DANGER | 🔴 `DANGER` | `rm -rf`, `git reset --hard`, force push, `curl … \| bash`, `DROP TABLE`, `dd if=`, `mkfs`, `chmod -R 777 /` |
| WARNING | 🟡 `WARNING` | `kill -9`, `fdisk`, `iptables -F`, `truncate -s 0` |

```
┌ wtflag ──────────────────────────────────────────────────────────────┐
│ rm -rf /tmp/build
│
│ DANGER  Recursive deletion — files cannot be recovered
│
│ rm — Remove files or directories
│   → permanently deletes '/tmp/build' — no trash, cannot be undone
│
│   -r            remove directories and their contents recursively
│   -f            ignore nonexistent files and arguments, never prompt
└───────────────────────────────────────────────────────────────────────┘
```

---

## Command coverage

wtflag has detailed argument-aware handlers for 100+ commands across:

- **Git** — all common subcommands with effect-level explanations (e.g. `git rebase -i` → "opens editor to squash, rename, reorder, or drop commits")
- **File operations** — `ls`, `cp`, `mv`, `rm`, `find`, `chmod`, `tar`, `zip`, `ln`, `diff`, `touch`, `wc`
- **Text processing** — `grep`, `sed`, `awk`, `sort`, `uniq`, `cut`, `tr`, `tee`, `xargs`, `head`, `tail`, `less`, `more`
- **Network** — `curl`, `wget`, `ssh`, `scp`, `rsync`, `ping`, `dig`, `nc`, `nmap`
- **System** — `ps`, `kill`, `df`, `du`, `env`, `export`, `uname`, `id`, `whoami`, `lsof`, `watch`, `make`, `crontab`
- **Node / npm / yarn** — `node`, `npm install/run/ci/publish`, `npx`, `yarn add/install/build`
- **Python / pip** — `python`, `python3`, `pip install/freeze/list`
- **Docker** — `docker run/build/exec/logs/ps/stop/rm`
- **Rust / cargo** — `cargo build/run/test/add/check/clippy/fmt`
- **systemd** — `systemctl start/stop/restart/enable/disable/status/daemon-reload`
- **Package managers** — `apt`, `apt-get`
- **Shell utilities** — `bash`, `sh`, `echo`, `history`, `source`, `sudo`, `jq`

For commands not in the list, wtflag falls back to the tldr-pages description and flag lookup — so you still get useful output.

---

## Configuration

wtflag stores its mute and block lists in `~/.config/wtflag/config.json`:

```json
{
  "mutelist": ["grep", "find"],
  "blocked": ["rm", "curl"]
}
```

Auto-accept entries are written directly to `~/.claude/settings.json` under `allowedTools`, which is the native Claude Code mechanism:

```json
{
  "allowedTools": [
    "Bash(command:git*)",
    "Bash(command:npm*)"
  ]
}
```

---

## Data sources

| Source | What it provides |
|---|---|
| `db/tldr.db` | SQLite database of ~2,000 command descriptions, built from [tldr-pages](https://github.com/tldr-pages/tldr) |
| `src/context.js` | Argument-aware handlers — interprets specific args and flags into plain English |
| `command --help` | Flag descriptions — fetched live and cached in-process per session |
| `src/danger.js` | Static rules for destructive command detection |

The database is not checked into the repo. It is built automatically on `npm install`, or manually with `wtflag update-db`.

---

## Project layout

```
bin/wtflag.js          CLI entry point (commander)
src/
  hook.js              PreToolUse hook handler — block check, explain, pass-through
  explain.js           Formats explanation and BLOCKED boxes (chalk)
  tokenizer.js         Shell string splitter — handles quotes, pipes, &&, ||
  tldr.js              SQLite wrapper for db/tldr.db
  flags.js             Runs `command --help` and matches flag descriptions
  danger.js            Detects destructive commands, renders DANGER/WARNING badges
  context.js           Maps (command, subcommand, args, flags) → human-readable context
  config.js            Reads/writes ~/.config/wtflag/config.json (mute and block lists)
  allow.js             Reads/writes allowedTools in ~/.claude/settings.json
  installer.js         Adds/removes the PreToolUse hook in ~/.claude/settings.json
  ipc.js               Unix socket path + helpers for watcher IPC
  watcher.js           Long-running socket server — receives and displays explanations
scripts/
  build-db.js          Downloads tldr.zip, parses .md files, writes db/tldr.db
db/
  tldr.db              SQLite database (gitignored, built by postinstall)
```

---

## Tech stack

- **Runtime**: Node.js ≥ 22 — uses the built-in `node:sqlite` module (no native bindings needed)
- **Module format**: ES Modules (`"type": "module"`)
- **Dependencies**: [`commander`](https://www.npmjs.com/package/commander), [`chalk`](https://www.npmjs.com/package/chalk), [`adm-zip`](https://www.npmjs.com/package/adm-zip)
- **No AI at runtime** — all lookups are static (SQLite + `--help` parsing + pattern matching)

---

## Uninstalling

```bash
wtflag uninstall
```

This removes the hook entry from `~/.claude/settings.json`. Claude Code will no longer call wtflag. Your mute and block lists remain in `~/.config/wtflag/config.json` and any `allowedTools` entries added via `wtflag allow` remain in `~/.claude/settings.json` — remove them manually if needed.

---

## License

MIT
