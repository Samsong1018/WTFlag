# wtflag — Production Readiness TODO

Priority: **HIGH** = blocker, **MEDIUM** = should fix before ship, **LOW** = polish

---

## HIGH — Bugs & Data Loss

### 1. `config.js` silently swallows corrupt JSON
`readConfig()` catches parse errors and returns empty defaults. If `~/.config/wtflag/config.json`
is corrupted, the user's entire block list and mute list silently disappears without any warning.
`allow.js` and `installer.js` were already fixed to throw — `config.js` needs the same treatment.
- **File:** `src/config.js` lines 8–14

### 2. Non-atomic DB write in `build-db.js`
The script deletes the existing `tldr.db` before writing the new one. If the download fails
mid-stream, the user is left with no DB at all and no error recovery path.
Fix: write to `tldr.db.tmp`, then rename over the old file.
- **File:** `scripts/build-db.js` lines 44–76

### 3. `.wtflag.json` parse failures are silent
`findProjectConfig()` catches JSON parse errors and returns `null`. The hook silently falls back
to global config, giving the user no indication their project config file is broken.
Should write a warning to stderr.
- **File:** `src/project-config.js` lines 7–18

---

## HIGH — Missing Documentation

### 4. README missing `wtflag status` command
`wtflag status` is not documented anywhere in the README. It's one of the most useful
first-run commands and new users will never know it exists.

### 5. README missing `wtflag sound` commands
The entire `sound` subcommand group (`on`, `off`, `play`, `status`) is not in the README.
Add a Sound section to the Commands table and a usage section.

---

## MEDIUM — Code Quality

### 6. `readSettings`/`writeSettings` duplicated in `allow.js` and `installer.js`
Both files implement identical `readSettings()` and `writeSettings()` functions that read/write
`~/.claude/settings.json`. Changes need to be made in two places. Extract to a shared
`src/settings.js` module.
- **Files:** `src/allow.js` lines 43–58, `src/installer.js` lines 73–89

### 7. `stmtCompound` and `stmtSingle` in `tldr.js` are identical
Both prepared statements use the same SQL. `stmtSingle` is never needed — `lookupCommand`
can reuse `stmtCompound`. Remove `stmtSingle`.
- **File:** `src/tldr.js` lines 27–29

### 8. `status.js` duplicates settings reading logic
`isHookInstalled()` reads and parses `~/.claude/settings.json` directly instead of using
`installer.js` exports. Should call an exported function from `installer.js`.
- **File:** `src/status.js` lines 13–25

---

## MEDIUM — UX / Destructive Operations

### 9. `wtflag log --clear` has no confirmation
Clearing the log is irreversible and permanent. Should require `--yes` flag or print a
confirmation prompt before wiping.
- **File:** `bin/wtflag.js` lines 253–256

### 10. `wtflag profile load` has no confirmation
Loading a profile replaces the current mute/block config entirely. Should warn the user
what will be overwritten and ask to confirm, or at least print what was replaced.
- **File:** `bin/wtflag.js` lines 351–361

### 11. `wtflag allow-all` modifies `~/.claude/CLAUDE.md` without explicit warning
Injecting an Autonomy block into the user's global CLAUDE.md is a significant change to
their Claude Code behaviour. The current output messages mention it, but the user should
be warned more clearly that this affects ALL Claude Code sessions, not just this project.

---

## MEDIUM — Test Coverage

### 12. No tests for `src/hook.js`
The hook is the core entry point — block-by-name, block-by-pattern, explain, audit log,
and pass-through all happen here. Needs integration-style tests that feed JSON via stdin
and assert stdout/stderr/exit-code.

### 13. No tests for `src/explain.js`
The `explain()` and `renderBlocked()` functions produce user-facing output. Needs tests for
multi-segment pipelines, muted commands, sudo transparency, and the blocked box renderer.

### 14. No tests for `src/context.js`
300+ lines of argument handlers with no test coverage. High regression risk when adding
new handlers. Needs a test per handler covering the common cases.

### 15. No tests for `src/sound.js`
The new `playSound()` function should have at least a smoke test that it doesn't throw
for each event type, and a test that it no-ops when the sound files are absent.

### 16. No tests for `src/project-config.js`
`getEffectiveConfig()` merges global + profile + project config. The merge logic (additive
only, profile inheritance) needs test coverage for all three layers.

### 17. No tests for `src/installer.js`
`install()`, `uninstall()`, `installSoundHooks()`, `uninstallSoundHooks()`, and
`isSoundHookInstalled()` all mutate `settings.json`. Needs tests using a temp file.

### 18. No tests for `src/allow.js`
`allowCommand`, `disallowCommand`, `allowAll`, `disallowAll` all mutate `settings.json`.
Same approach as installer tests — use a temp settings file.

### 19. No tests for `src/log.js`
`appendLog`, `readLog`, `clearLog` need basic round-trip and corrupt-line tolerance tests.

---

## LOW — npm Publishing Readiness

### 20. `package.json` missing publishing metadata
Before publishing to npm, add:
- `"files"` — to exclude `test/`, `scripts/`, `node_modules/`, `.claude/`
- `"keywords"` — for discoverability
- `"repository"` — link to GitHub
- `"bugs"` — issue tracker URL
- `"homepage"` — README URL

### 21. `.npmignore` or `"files"` will expose `test/` and `scripts/` on publish
Without a `"files"` field, `npm publish` includes everything not in `.gitignore`.
The `test/` and `scripts/` directories should not be in the published package.

---

## LOW — Polish

### 22. Fork bomb regex edge case
The fork bomb pattern `: () { :|:& }; :` has variants that may slip through. Consider
also matching `:(){ :|:& };:` (no spaces). Low risk since this is informational only.
- **File:** `src/danger.js` line 106

### 23. `wtflag explain` output goes to stdout, hook output goes to stderr
Minor inconsistency. Fine for now but worth documenting in CLAUDE.md for contributors.

### 24. `build-db.js` uses `createRequire` for `adm-zip`
This is a workaround for adm-zip not having named ESM exports. Fine, but add a comment
explaining why so future contributors don't remove it thinking it's unnecessary.
- **File:** `scripts/build-db.js` line 8

---

## Done (this session — LOW items + documentation)
- [x] README: added `wtflag status` to Setup commands table (item 4)
- [x] README: added Sound commands table + Sound notifications section (item 5)
- [x] README: corrected `log --clear` to show `--yes` requirement
- [x] `package.json`: added `"files"`, `"keywords"`, `"repository"`, `"bugs"`, `"homepage"` (items 20, 21)
- [x] `danger.js`: added comment clarifying fork bomb regex covers both spaced and compact forms (item 22)
- [x] `test/danger.test.js`: added tests for spaced and compact fork bomb forms (item 22)
- [x] `.claude/CLAUDE.md`: documented stdout/stderr routing asymmetry (item 23)
- [x] `scripts/build-db.js`: added comment explaining `createRequire` for adm-zip (item 24)

## Done (this session — MEDIUM items)
- [x] `readSettings`/`writeSettings` extracted to `src/settings.js` (items 6, 8)
- [x] `stmtSingle` removed from `src/tldr.js` (item 7)
- [x] `wtflag log --clear` requires `--yes` confirmation flag (item 9)
- [x] `wtflag profile load` shows current config before replacing (item 10)
- [x] `wtflag allow-all` warns that changes are global (item 11)
- [x] Tests: `src/explain.js` — 12 tests (item 13)
- [x] Tests: `src/context.js` — 19 tests (item 14)
- [x] Tests: `src/sound.js` — 4 tests (item 15)
- [x] Tests: `src/project-config.js` — 8 tests (item 16)
- [x] Tests: `src/installer.js` — 10 tests (item 17)
- [x] Tests: `src/allow.js` — 10 tests (item 18)
- [x] Tests: `src/log.js` — 7 tests (item 19)
- [x] Tests: `src/hook.js` — 7 tests (item 12)

## Done (previous session)
- [x] `config.js` throws on corrupt JSON instead of silently returning defaults (item 1)
- [x] Atomic DB write in `build-db.js` (write-to-tmp then rename) (item 2)
- [x] `.wtflag.json` parse failures write stderr warning (item 3)
- [x] Path traversal vulnerability in `src/profiles.js`
- [x] Silent JSON corruption in `src/installer.js`
- [x] Silent JSON corruption in `src/allow.js`
- [x] Missing test suite — danger, tokenizer, config patterns, profiles
