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

| Command | Description |
|---|---|
| `wtflag install` | Adds the `PreToolUse` hook to `~/.claude/settings.json` |
| `wtflag uninstall` | Removes the hook |
| `wtflag explain <cmd>` | Manually explain a command string |
| `wtflag hook` | Hook entrypoint — reads Claude Code's Bash tool JSON from stdin |
| `wtflag watch` | Opens a watcher terminal — explanations stream here as Claude works |
| `wtflag update-db` | Re-downloads and rebuilds the tldr-pages database |

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

## How it works

```
Claude Code
    │  (about to run a Bash tool)
    ▼
PreToolUse hook → wtflag hook
    │
    ├─ tokenizer.js     splits shell string into segments, handles pipes/&&/||
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
(Claude Code is never blocked)
```

The hook always exits 0 and passes the original JSON through to stdout — Claude Code is never interrupted.

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
  hook.js              PreToolUse hook handler
  explain.js           Formats the explanation box (chalk)
  tokenizer.js         Shell string splitter — handles quotes, pipes, &&, ||
  tldr.js              SQLite wrapper for db/tldr.db
  flags.js             Runs `command --help` and matches flag descriptions
  danger.js            Detects destructive commands, renders DANGER/WARNING badges
  context.js           Maps (command, subcommand, args, flags) → human-readable context
  installer.js         Reads/writes ~/.claude/settings.json
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

This removes the hook entry from `~/.claude/settings.json`. Claude Code will no longer call wtflag.

---

## License

MIT
