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
- **Block** commands you never want Claude to run — by name or by pattern
- **Allow** commands so Claude never has to ask for permission
- **Profiles** to switch between named rule sets in one command
- **Per-project config** to set different rules per repository
- **Audit log** to keep a permanent record of everything Claude ran

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
| `wtflag status` | Show hook state, watcher, config summary, and log stats |

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
| `wtflag block <command or pattern>` | Block a command name or a pattern string |
| `wtflag unblock <command or pattern>` | Remove a block |
| `wtflag blocked` | Show all blocked commands and patterns |

### Auto-accepting (skip permission prompts)

| Command | Description |
|---|---|
| `wtflag allow <command>` | Auto-accept a command — no permission prompt |
| `wtflag disallow <command>` | Remove auto-accept (permission prompt returns) |
| `wtflag allow-all` | Auto-accept all Bash commands |
| `wtflag disallow-all` | Remove allow-all |
| `wtflag allowed` | Show all auto-accepted commands |

### Audit log

| Command | Description |
|---|---|
| `wtflag log` | Show last 20 log entries |
| `wtflag log --all` | Show full history |
| `wtflag log --blocked` | Show only blocked commands |
| `wtflag log --danger` | Show only commands that triggered danger warnings |
| `wtflag log -n <count>` | Show last N entries |
| `wtflag log --clear --yes` | Clear the log (requires `--yes` to confirm) |
| `wtflag log --path` | Print the log file path |

### Profiles

| Command | Description |
|---|---|
| `wtflag profile list` | List all built-in and user profiles |
| `wtflag profile show <name>` | Show a profile's contents |
| `wtflag profile save <name>` | Save current config as a named profile |
| `wtflag profile load <name>` | Apply a profile — replaces current mute/block settings |
| `wtflag profile delete <name>` | Delete a user-saved profile |

### Per-project config

| Command | Description |
|---|---|
| `wtflag project-config` | Show the `.wtflag.json` active for the current directory |

### Sound

| Command | Description |
|---|---|
| `wtflag sound on` | Enable ping sounds — plays when Claude asks for permission or finishes |
| `wtflag sound off` | Disable ping sounds |
| `wtflag sound status` | Show whether sound is enabled and hooks are installed |
| `wtflag sound play [event]` | Play a sound immediately (events: `notification`, `stop`) |

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

### Pattern blocking

If the argument to `wtflag block` contains a space or `*`, it's treated as a pattern rather than a command name:

```bash
wtflag block "git push --force"    # blocks any force push
wtflag block "curl * | bash"       # blocks curl-pipe-to-shell
wtflag block "DROP TABLE *"        # blocks SQL drops
```

Patterns use glob-style `*` (matches anything) and are tested case-insensitively against the full raw command string. `wtflag blocked` shows both command names and patterns as separate lists.

> **Warning: patterns match the full raw command string.**
>
> This means a pattern fires if the text appears _anywhere_ in the command — including inside quoted string arguments. For example, with `rm -rf` in the block list, the command `echo "don't run rm -rf /"` would also be blocked because the literal string `rm -rf` appears inside the quoted argument.
>
> This is intentional — it's how wtflag catches dangerous patterns in pipe chains like `curl url | bash` — but it means short or common patterns can produce unexpected matches. If you need to manage the block list while a broad pattern is active, edit `~/.config/wtflag/config.json` directly rather than running `wtflag unblock "..."` through Claude Code.

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

## Audit log

Every command Claude runs is appended to `~/.local/share/wtflag/log.jsonl` with a timestamp, working directory, blocked status, and danger level.

```bash
wtflag log              # last 20 entries
wtflag log --blocked    # only blocked attempts
wtflag log --danger     # only commands that triggered DANGER or WARNING
wtflag log --all        # full history
```

Output format:

```
04/29 14:23:01  [BLOCKED]   rm -rf /var/www                  (~/myproject)
04/29 14:22:45  [DANGER]    git reset --hard HEAD~3           (~/myproject)
04/29 14:22:30              git status                        (~/myproject)
```

The log is append-only JSONL — you can query it directly with `jq` if you need more than the built-in filters. `wtflag log --path` prints the full path.

---

## Profiles

Profiles are named bundles of mute/block/pattern settings. Three built-in profiles ship with wtflag:

| Profile | Description |
|---|---|
| `safe` | Blocks destructive commands (`dd`, `mkfs`, `fdisk`) and dangerous patterns (`rm -rf`, force push, `curl \| bash`, etc.) |
| `dev` | Mutes noisy read-only commands (`grep`, `find`, `ls`, `cat`, `echo`, `pwd`) |
| `readonly` | Blocks all write operations — `rm`, `mv`, `cp`, `chmod`, `git commit`, `git push`, `npm install`, etc. |

```bash
wtflag profile list             # see all profiles
wtflag profile show safe        # inspect a profile before loading
wtflag profile load safe        # apply it — replaces current mute/block config
wtflag profile save mysetup     # snapshot your current config as a user profile
wtflag profile load mysetup     # restore it later
wtflag profile delete mysetup   # remove a user profile
```

`profile load` replaces the current mute/block/blockPatterns settings. `allowedTools` in `~/.claude/settings.json` is not touched by profiles. Built-in profiles cannot be deleted or overwritten.

---

## Per-project config

Place a `.wtflag.json` file in any project directory to set rules that apply only when Claude is working in that repo. The hook walks up from its working directory to find it.

```json
{
  "blocked": ["kubectl delete", "terraform destroy"],
  "blockPatterns": ["DROP DATABASE"],
  "muted": ["eslint", "prettier"]
}
```

Project rules merge additively on top of your global config — they can only add restrictions, not remove them. You can also inherit a named profile as the project base:

```json
{
  "profile": "readonly",
  "muted": ["tsc", "eslint"]
}
```

```bash
wtflag project-config    # show which .wtflag.json is active and its contents
```

---

## Sound notifications

wtflag can play a ping sound when Claude asks for your permission (a `Notification` event) or finishes its task (a `Stop` event). This is useful when Claude is working in the background and you want to know when it needs input or is done.

```bash
wtflag sound on     # enable — installs Stop and Notification hooks
wtflag sound off    # disable — removes the hooks
wtflag sound status # check whether sound is on and hooks are wired up
```

Sound hooks are written into `~/.claude/settings.json`. Restart Claude Code after running `wtflag sound on` to activate them.

`wtflag sound on` uses `paplay` (Linux/PulseAudio), `ffplay` (Linux fallback), `afplay` (macOS), or a PowerShell beep (Windows) — whichever is available. If none are found, the command silently no-ops.

---

## How it works

```
Claude Code
    │  (about to run a Bash tool)
    ▼
PreToolUse hook → wtflag hook
    │
    ├─ Load config   global config + project .wtflag.json merged
    │
    ├─ Block check (command names)
    │     if any segment's effective command is in the block list:
    │       → BLOCKED box to stderr
    │       → logged to audit log
    │       → exit(2) — Claude Code cancels the tool call
    │
    ├─ Block check (patterns)
    │     if the raw command string matches any block pattern:
    │       → BLOCKED box to stderr
    │       → logged to audit log
    │       → exit(2) — Claude Code cancels the tool call
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
    ├─ Audit log        command, cwd, blocked status, danger level → log.jsonl
    │
    ▼
Original JSON passed through to stdout
(Claude Code proceeds normally)
```

The hook passes the original JSON through to stdout on success. On a block, it exits with code `2` and writes nothing to stdout — Claude Code treats this as a cancelled tool call and Claude receives the BLOCKED message as context.

---

## Danger detection

wtflag checks the full raw command string (including pipe chains) against a set of built-in rules before it runs:

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

Danger detection is informational — it shows a badge but does not block execution. To actually prevent a dangerous command from running, add it to the block list.

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

### `~/.config/wtflag/config.json`

Stores mute list, command block list, and block patterns:

```json
{
  "mutelist": ["grep", "find"],
  "blocked": ["rm", "curl"],
  "blockPatterns": ["git push --force", "curl * | bash"]
}
```

Edit this file directly when managing the block list while a pattern is active (see warning in [Pattern blocking](#pattern-blocking)).

### `~/.claude/settings.json`

Auto-accept entries are written here under `allowedTools`:

```json
{
  "allowedTools": [
    "Bash(command:git*)",
    "Bash(command:npm*)"
  ]
}
```

### `~/.local/share/wtflag/log.jsonl`

Append-only audit log. Each line is a JSON object:

```json
{"ts":"2026-04-29T14:23:01.123Z","command":"rm -rf /var/www","cwd":"/home/user/myproject","blocked":true,"blockedBy":"rm","blockedType":"command","danger":[]}
```

### `~/.config/wtflag/profiles/`

User-saved profiles, one JSON file per profile.

### `.wtflag.json` (project root)

Per-project overrides. Merged additively on top of global config at hook runtime.

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
  hook.js              PreToolUse hook — block check, explain, audit log, pass-through
  explain.js           Formats explanation and BLOCKED boxes (chalk)
  tokenizer.js         Shell string splitter — handles quotes, pipes, &&, ||
  tldr.js              SQLite wrapper for db/tldr.db
  flags.js             Runs `command --help` and matches flag descriptions
  danger.js            Detects destructive commands, renders DANGER/WARNING badges
  context.js           Maps (command, subcommand, args, flags) → human-readable context
  config.js            Reads/writes ~/.config/wtflag/config.json (mute, block, patterns)
  allow.js             Reads/writes allowedTools in ~/.claude/settings.json
  log.js               Appends to and queries ~/.local/share/wtflag/log.jsonl
  profiles.js          Built-in and user profile management
  project-config.js    Finds .wtflag.json, merges with global config at runtime
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

This removes the hook entry from `~/.claude/settings.json`. Claude Code will no longer call wtflag. Your config and log remain at `~/.config/wtflag/` and `~/.local/share/wtflag/` — remove them manually if needed. Any `allowedTools` entries added via `wtflag allow` also remain in `~/.claude/settings.json` and should be removed manually.

---

## License

MIT
