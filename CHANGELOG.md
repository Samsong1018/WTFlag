# Changelog

All notable changes to wtflag are documented here.

## [1.0.0] — 2026-05-12

### Added
- `PreToolUse` hook integration with Claude Code — explains every Bash command before it runs
- tldr-pages SQLite database (~2,000 command descriptions, built automatically on install)
- Argument-aware context handlers for 100+ commands (git, npm, docker, systemd, cargo, and more)
- Live flag descriptions fetched from `command --help` and cached per session
- Danger detection — `DANGER` / `WARNING` badges for destructive commands (rm -rf, force push, curl | bash, dd, mkfs, etc.)
- Command blocking — prevent Claude from running commands by name or glob pattern; exit(2) cancels the tool call
- Command muting — suppress explanations for noisy read-only commands
- Auto-accept — add commands to Claude Code's `allowedTools` to skip permission prompts
- Audit log — append-only JSONL at `~/.local/share/wtflag/log.jsonl` with timestamp, cwd, blocked status, and danger level
- Profiles — built-in `safe`, `dev`, and `readonly` profiles; user-saved profiles via `wtflag profile save`
- Per-project config — `.wtflag.json` in any project root merges additively on top of global config
- Watcher terminal — `wtflag watch` streams explanations to a dedicated pane via Unix socket
- Sound notifications — ping on permission request or task completion (`wtflag sound on`)
- Secret scanning — detects API keys, tokens, and credentials in staged diffs before git push
- `wtflag status` — shows hook state, watcher status, config summary, and log stats
- `wtflag update-db` — re-downloads and rebuilds the tldr-pages database
- Atomic database writes — write to `.tmp` then rename, no partial-DB state on failure
- Path traversal protection in profile name handling
