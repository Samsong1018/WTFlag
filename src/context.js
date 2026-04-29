function trunc(str, max = 30) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Common shell command names — used to detect when an argument is itself a shell command
const SHELL_CMD_NAMES = new Set([
  'sed', 'awk', 'grep', 'find', 'git', 'npm', 'pip', 'pip3', 'curl', 'wget',
  'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'chmod', 'tar', 'zip', 'ssh',
  'rsync', 'docker', 'python', 'python3', 'node', 'cargo', 'apt', 'apt-get',
  'systemctl', 'bash', 'sh', 'echo', 'env', 'export', 'yarn', 'npx',
]);

function looksLikeShellCommand(str) {
  if (!str || !str.includes(' ')) return false;
  return SHELL_CMD_NAMES.has(str.split(' ')[0].toLowerCase());
}

// Translates a 3-digit octal permission string into plain English.
// e.g. '755' → 'owner: read/write/run, group & others: read/run'
function describeOctalPerms(mode) {
  // Accept 3 or 4 digits (leading digit = special bits, ignore for description)
  const digits = /^\d{4}$/.test(mode) ? mode.slice(1) : mode;
  if (!/^\d{3}$/.test(digits)) return null;

  const label = (n) => {
    const parts = [n & 4 ? 'read' : null, n & 2 ? 'write' : null, n & 1 ? 'run' : null];
    return parts.filter(Boolean).join('/') || 'no access';
  };

  const [o, g, w] = digits.split('').map(Number);
  const ol = label(o), gl = label(g), wl = label(w);

  // Compact: collapse group+others when identical
  if (gl === wl) return `owner: ${ol} — group & others: ${gl}`;
  return `owner: ${ol} — group: ${gl} — others: ${wl}`;
}

const HANDLERS = {
  // --- git ---
  'git add': (args, flags) => {
    const isAll = flags.includes('-A') || flags.includes('--all') || args.includes('.');
    if (isAll || args[0] === '.') return 'snapshots all changes — new, modified, and deleted files — queued for the next commit';
    if (args.length === 1) return `marks '${args[0]}' to be included in the next commit`;
    if (args.length > 1) return `marks ${args.length} files to be included in the next commit`;
    return null;
  },
  'git branch': (args, flags) => {
    const name = args[0];
    const isForceDelete = flags.includes('-D');
    const isDelete = flags.some(f => ['-d', '--delete'].includes(f));
    if (isForceDelete && name) return `force-deletes '${name}' even if it has unmerged changes`;
    if (isDelete && name) return `deletes '${name}' — only works if it has been fully merged`;
    if (name) return `creates branch '${name}' at the current commit — does not switch to it`;
    return 'lists all local branches — the current one is marked with *';
  },
  'git cherry-pick': (args) => {
    const commit = args[0];
    return commit ? `copies commit '${trunc(commit, 12)}' onto the current branch — replays its changes as a new commit` : null;
  },
  'git checkout': (args, flags) => {
    const target = args[0];
    if (!target) return null;
    const isNew = flags.includes('-b') || flags.includes('-B');
    return isNew
      ? `creates branch '${target}' from current HEAD and switches to it`
      : `switches working tree to '${target}' — your uncommitted changes stay unless they conflict`;
  },
  'git clean': (args, flags) => {
    const isDry = flags.includes('-n') || flags.includes('--dry-run');
    if (isDry) return 'previews untracked files that would be removed — does not actually delete anything';
    return 'removes untracked files that git is not tracking — cannot be undone';
  },
  'git clone': (args) => {
    const [url, dest] = args;
    if (url && dest) return `downloads the full repo from '${trunc(url, 35)}' into '${dest}' — includes all history and branches`;
    if (url) return `downloads the full repo from '${trunc(url, 40)}' — includes all history`;
    return null;
  },
  'git commit': (args, flags) => {
    const isAmend = flags.includes('--amend');
    const isAll = flags.includes('-a');
    const msg = args[0];
    if (isAmend && msg) return `rewrites the last commit with message: '${trunc(msg, 30)}' — changes its hash, avoid if already pushed`;
    if (isAmend) return 'edits the last commit — lets you change message or add staged files — avoid after pushing';
    if (msg && isAll) return `stages all tracked changes and commits: '${trunc(msg, 35)}' — untracked new files are not included`;
    if (msg) return `saves the staged snapshot to history: '${trunc(msg, 40)}'`;
    if (isAll) return 'stages every modified tracked file then opens editor for the commit message';
    return null;
  },
  'git config': (args, flags) => {
    const isGlobal = flags.includes('--global');
    const isUnset = flags.includes('--unset');
    const isList = flags.includes('-l') || flags.includes('--list');
    const scope = isGlobal ? 'global (~/.gitconfig) ' : '';
    if (isList) return `lists all ${scope}git settings`;
    if (isUnset && args[0]) return `removes ${scope}setting '${args[0]}'`;
    if (args[0] && args[1]) return `sets ${scope}'${args[0]}' = '${trunc(args[1], 30)}'`;
    if (args[0]) return `reads ${scope}setting '${args[0]}'`;
    return null;
  },
  'git diff': (args) => {
    if (!args.length) return 'shows unstaged line-by-line changes — what `git add` would capture';
    if (args[0] === '--staged' || args[0] === '--cached') return 'shows staged changes — exactly what will go into the next commit';
    if (args.length === 1) return `compares the working tree against '${args[0]}'`;
    return null;
  },
  'git fetch': (args, flags) => {
    const remote = args[0];
    const isAll = flags.includes('--all');
    const isPrune = flags.includes('--prune') || flags.includes('-p');
    if (isAll) return 'downloads updates from all remotes — local branches are not changed until you merge';
    if (remote && isPrune) return `downloads from '${remote}' and removes refs to branches deleted on the remote`;
    if (remote) return `downloads new commits from '${remote}' — your local branches stay unchanged until you merge`;
    return 'downloads remote updates — local branches stay unchanged until you run git merge';
  },
  'git init': (args) => {
    const dir = args[0];
    return dir ? `initializes a new git repo in '${dir}' — creates a .git folder to track history` : 'turns the current directory into a git repo — creates a .git folder';
  },
  'git log': (args, flags) => {
    const n = flags.find(f => /^-\d+$/.test(f));
    const isOneline = flags.includes('--oneline');
    if (n && isOneline) return `shows last ${n.slice(1)} commits as one line each — short hash and message`;
    if (n) return `shows last ${n.slice(1)} commits — author, date, and message for each`;
    if (args[0]) return `shows commit history for '${args[0]}'`;
    return 'browses the commit history — author, timestamp, and message for each commit';
  },
  'git merge': (args) => {
    const branch = args[0];
    return branch ? `integrates commits from '${branch}' into the current branch — creates a merge commit if histories diverged` : null;
  },
  'git mv': (args) => {
    const [src, dest] = args;
    return src && dest ? `renames '${src}' to '${dest}' and stages the change — git tracks this as a rename, not delete+add` : null;
  },
  'git pull': (args) => {
    const [remote, branch] = args;
    if (remote && branch) return `downloads '${branch}' from '${remote}' and merges it into the current branch`;
    if (remote) return `fetches from '${remote}' and merges into the current branch`;
    return 'shorthand for git fetch + git merge — gets remote changes and integrates them locally';
  },
  'git push': (args, flags) => {
    const [remote, branch] = args;
    if (remote && branch) return `uploads local '${branch}' commits to '${remote}' — makes them available to others`;
    if (remote) return `sends committed changes to '${remote}' — others can now fetch or pull them`;
    return null;
  },
  'git rebase': (args, flags) => {
    const target = args[0];
    const isInteractive = flags.includes('-i') || flags.includes('--interactive');
    if (target && isInteractive) return `opens editor to squash, rename, reorder, or drop commits — replays them onto '${target}', rewrites history`;
    if (target) return `replays current branch commits on top of '${target}' — linear history but commit hashes change`;
    return null;
  },
  'git remote': (args) => {
    const sub = args[0];
    if (sub === 'add') return args[1] && args[2] ? `registers '${args[1]}' as a remote pointing to '${trunc(args[2], 35)}'` : 'adds a new remote';
    if (sub === 'remove' || sub === 'rm') return args[1] ? `removes the remote named '${args[1]}'` : 'removes a remote';
    if (sub === 'set-url') return args[1] ? `changes the URL of remote '${args[1]}'` : 'changes a remote URL';
    return 'lists configured remotes — shows their names and URLs with -v';
  },
  'git restore': (args, flags) => {
    const isStaged = flags.includes('--staged');
    const file = args[0];
    if (isStaged && file) return `unstages '${file}' — moves it back to the working tree without losing changes`;
    if (isStaged) return 'unstages all staged changes — files are not modified, just removed from the staging area';
    if (file) return `discards uncommitted changes in '${file}' — restores it to the last committed state`;
    return null;
  },
  'git rm': (args, flags) => {
    const isCached = flags.includes('--cached');
    const file = args[0];
    if (isCached && file) return `stops tracking '${file}' but leaves it on disk — useful for files that should be in .gitignore`;
    if (file) return `removes '${file}' from tracking and deletes it from disk`;
    return null;
  },
  'git show': (args) => {
    const ref = args[0];
    return ref ? `shows the diff and metadata for '${trunc(ref, 20)}'` : 'shows the full diff and metadata of the latest commit';
  },
  'git stash': (args) => {
    const sub = args[0];
    if (sub === 'pop') return 'restores the most recent stash and removes it — use when you are ready to continue that work';
    if (sub === 'apply') return 'applies the stash without removing it — useful to port the same changes to multiple branches';
    if (sub === 'drop') return 'permanently discards the most recent stash';
    if (sub === 'list') return 'shows all saved stashes — stash@{0} is the most recent';
    if (sub === 'show') return 'shows a diff summary of what changed in the most recent stash';
    if (!sub) return 'shelves uncommitted changes so you can switch context with a clean working tree';
    return null;
  },
  'git status': (args, flags) => {
    const isShort = flags.includes('-s') || flags.includes('--short');
    return isShort
      ? 'compact view of staged, unstaged, and untracked changes'
      : 'shows staged changes (will commit), unstaged changes (not yet staged), and untracked files';
  },
  'git switch': (args, flags) => {
    const target = args[0];
    const isNew = flags.includes('-c') || flags.includes('-C') || flags.includes('--create');
    if (isNew && target) return `creates branch '${target}' and switches to it`;
    if (target) return `switches to branch '${target}'`;
    return null;
  },
  'git tag': (args, flags) => {
    const isDelete = flags.includes('-d') || flags.includes('--delete');
    const name = args[0];
    if (isDelete && name) return `deletes tag '${name}' locally — does not remove it from the remote`;
    if (name) return `creates tag '${name}' at the current commit — tags mark release points in history`;
    return 'lists all tags';
  },

  // --- File ops ---
  'cat': (args) => {
    const files = args.filter(a => !a.startsWith('-'));
    if (files.length === 1) return `prints '${files[0]}' to the terminal`;
    if (files.length > 1) return `concatenates and prints ${files.length} files in order`;
    return null;
  },
  'cd': (args) => {
    const dir = args[0];
    return dir ? `changes the working directory to '${dir}'` : 'changes to your home directory';
  },
  'chmod': (args, flags) => {
    const isRecursive = flags.includes('-R') || flags.includes('-r') || flags.includes('--recursive');
    const pos = args.filter(a => !a.startsWith('-'));
    const [mode, ...targets] = pos;
    if (!mode || !targets.length) return null;
    const extra = targets.length > 1 ? ` (+${targets.length - 1} more)` : '';
    const rec = isRecursive ? 'recursively ' : '';
    const permDesc = describeOctalPerms(mode);
    if (permDesc) return `${rec}sets '${targets[0]}'${extra} permissions to: ${permDesc}`;
    return `${rec}sets permissions '${mode}' on '${targets[0]}'${extra}`;
  },
  'chown': (args, flags) => {
    const isRecursive = flags.includes('-R') || flags.includes('--recursive');
    const pos = args.filter(a => !a.startsWith('-'));
    const [owner, target] = pos;
    return owner && target
      ? `${isRecursive ? 'recursively ' : ''}transfers ownership of '${target}' to '${owner}'`
      : null;
  },
  'cp': (args, flags) => {
    const isRecursive = flags.includes('-r') || flags.includes('-R') || flags.includes('--recursive');
    const pos = args.filter(a => !a.startsWith('-'));
    if (pos.length < 2) return null;
    const dest = pos[pos.length - 1];
    const srcs = pos.slice(0, -1);
    const rec = isRecursive ? 'recursively ' : '';
    return srcs.length === 1
      ? `${rec}copies '${srcs[0]}' to '${dest}'`
      : `${rec}copies ${srcs.length} items into '${dest}'`;
  },
  'cut': (args, flags) => {
    const isFields = flags.includes('-f');
    const isChars = flags.includes('-c');
    const delimIdx = flags.indexOf('-d');
    const delim = delimIdx >= 0 ? (args[delimIdx] ?? null) : null;
    const fields = args.find(a => /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(a));
    if (isFields && fields && delim) return `extracts field(s) ${fields} from each line, split on '${delim}'`;
    if (isFields && fields) return `extracts column(s) ${fields} from each line (tab-delimited by default)`;
    if (isChars && fields) return `extracts character position(s) ${fields} from each line`;
    return 'cuts selected fields or characters from each line of input';
  },
  'diff': (args, flags) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [a, b] = pos;
    const isRecursive = flags.includes('-r') || flags.includes('--recursive');
    if (a && b) return `${isRecursive ? 'recursively ' : ''}shows line-by-line differences between '${a}' and '${b}'`;
    return null;
  },
  'echo': (args, flags) => {
    const noNewline = flags.includes('-n');
    const text = args.join(' ');
    if (!text) return 'prints a blank line';
    return `prints '${trunc(text, 50)}'${noNewline ? ' without a trailing newline' : ''}`;
  },
  'find': (args, flags, subcommand) => {
    // Starting directory may land in subcommand (e.g. "find src ...") or args (e.g. "find . ...")
    const allPos = [subcommand, ...args].filter(Boolean);
    const dir = allPos.find(a => !a.startsWith('-'));
    let pattern = null;
    let type = null;

    if (flags.includes('-name')) {
      pattern = args.filter(a => !a.startsWith('-') && a !== dir)[0] ?? null;
    } else {
      const idx = args.indexOf('-name');
      if (idx >= 0) pattern = args[idx + 1] ?? null;
    }

    if (flags.includes('-type')) {
      type = args.find(a => /^[fd]$/.test(a)) ?? null;
    } else {
      const idx = args.indexOf('-type');
      if (idx >= 0) type = args[idx + 1] ?? null;
    }

    const typeDesc = type === 'f' ? 'files' : type === 'd' ? 'directories' : null;
    if (dir && pattern && typeDesc) return `searches '${dir}' recursively for ${typeDesc} matching '${pattern}'`;
    if (dir && pattern) return `searches '${dir}' recursively for files matching '${pattern}'`;
    if (dir) return `walks the directory tree under '${dir}' and lists every file found`;
    return null;
  },
  'grep': (args, flags, subcommand) => {
    const isRecursive = flags.includes('-r') || flags.includes('-R') || flags.includes('--recursive');
    const isInvert = flags.includes('-v') || flags.includes('--invert-match');
    const isCaseInsensitive = flags.includes('-i') || flags.includes('--ignore-case');
    const isLineNum = flags.includes('-n') || flags.includes('--line-number');
    const pos = args.filter(a => !a.startsWith('-'));
    const pattern = subcommand ?? pos[0];
    const files = subcommand ? pos : pos.slice(1);
    if (!pattern) return null;
    const mods = [
      isInvert ? 'non-matching lines' : null,
      isCaseInsensitive ? 'case-insensitive' : null,
      isLineNum ? 'with line numbers' : null,
    ].filter(Boolean).join(', ');
    const modStr = mods ? ` — ${mods}` : '';
    if (isRecursive && files.length) return `searches every file under '${files[0]}' and prints lines matching '${pattern}'${modStr}`;
    if (files.length === 1) return `prints lines from '${files[0]}' that match '${pattern}'${modStr}`;
    if (files.length > 1) return `prints matching lines from ${files.length} files for pattern '${pattern}'${modStr}`;
    return `filters piped input, printing only lines that contain '${pattern}'${modStr}`;
  },
  'head': (args, flags) => {
    const n = args.find(a => /^\d+$/.test(a));
    const file = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    if (n && file) return `shows the first ${n} lines of '${file}'`;
    if (file) return `shows the first 10 lines of '${file}'`;
    if (n) return `shows the first ${n} lines of piped input`;
    return null;
  },
  'history': (args) => {
    const n = args.find(a => /^\d+$/.test(a));
    return n ? `shows the last ${n} commands from shell history` : 'shows all commands from shell history for this session';
  },
  'jq': (args, flags, subcommand) => {
    const filter = subcommand ?? args[0];
    const file = args.find(a => !a.startsWith('-') && a !== filter);
    if (filter === '.' && file) return `pretty-prints JSON from '${file}' with colorized output`;
    if (filter === '.') return 'pretty-prints and validates JSON from stdin';
    if (filter && file) return `queries '${file}' with filter: ${trunc(filter, 40)}`;
    if (filter) return `transforms piped JSON with: ${trunc(filter, 40)}`;
    return 'parses and transforms JSON';
  },
  'less': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file
      ? `opens '${file}' in a scrollable pager — arrow keys to scroll, / to search, q to quit`
      : 'reads piped input in a scrollable pager — / to search, q to quit';
  },
  'ln': (args, flags) => {
    const isSymlink = flags.includes('-s') || flags.includes('--symbolic');
    const pos = args.filter(a => !a.startsWith('-'));
    const [src, dest] = pos;
    if (isSymlink && src && dest) return `creates symlink '${dest}' pointing to '${src}' — the link updates automatically if the target moves`;
    if (isSymlink && src) return `creates a symlink to '${src}'`;
    if (src && dest) return `creates a hard link '${dest}' — same inode as '${src}', survives target deletion`;
    return null;
  },
  'ls': (args, flags) => {
    const dirs = args.filter(a => !a.startsWith('-'));
    const isLong = flags.includes('-l');
    const isAll = flags.includes('-a') || flags.includes('-A');
    const isHuman = flags.includes('-h');
    const mods = [
      isLong ? 'permissions, owner, size, and date' : null,
      isAll ? 'including hidden dotfiles' : null,
      isHuman ? 'human-readable sizes' : null,
    ].filter(Boolean);
    const modStr = mods.length ? ` — ${mods.join(', ')}` : '';
    if (dirs.length === 1) return `lists contents of '${dirs[0]}'${modStr}`;
    if (dirs.length > 1) return `lists ${dirs.length} directories${modStr}`;
    return `lists the current directory${modStr}`;
  },
  'lsof': (args, flags) => {
    const hasNet = flags.includes('-i');
    const file = args.find(a => !a.startsWith('-'));
    if (hasNet) return 'lists all open network connections — shows the process holding each socket and its port';
    if (file) return `shows which processes currently have '${file}' open`;
    return 'lists every open file on the system — files, sockets, and pipes, with their owning process';
  },
  'make': (args) => {
    const target = args[0];
    if (target) return `runs the '${target}' build target from Makefile — only rebuilds files that changed`;
    return 'runs the default Makefile target — only rebuilds what has changed since the last build';
  },
  'mkdir': (args, flags) => {
    const isParents = flags.includes('-p') || flags.includes('--parents');
    const dir = args.find(a => !a.startsWith('-'));
    if (!dir) return null;
    return `creates directory '${dir}'${isParents ? ' — also creates any missing parent directories' : ''}`;
  },
  'more': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file
      ? `pages through '${file}' — space for next page, q to quit`
      : 'pages through piped input one screen at a time';
  },
  'mv': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    if (pos.length < 2) return null;
    return `moves '${pos[0]}' to '${pos[pos.length - 1]}' — also works as a rename when staying in the same directory`;
  },
  'rm': (args) => {
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length === 1) return `permanently deletes '${targets[0]}' — no trash, cannot be undone`;
    if (targets.length > 1) return `permanently deletes ${targets.length} items — no trash, cannot be undone`;
    return null;
  },
  'tail': (args, flags) => {
    const isFollow = flags.includes('-f') || flags.includes('--follow');
    const n = args.find(a => /^\d+$/.test(a));
    const file = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    if (isFollow && file) return `watches '${file}' live — prints each new line as it is appended, great for log files (Ctrl-C to stop)`;
    if (n && file) return `shows the last ${n} lines of '${file}'`;
    if (file) return `shows the last 10 lines of '${file}'`;
    return null;
  },
  'touch': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `creates '${file}' if it does not exist, or updates its last-modified timestamp if it does` : null;
  },
  'unzip': (args) => {
    const archive = args.find(a => !a.startsWith('-'));
    return archive ? `extracts all contents of '${archive}' into the current directory` : null;
  },
  'watch': (args, flags) => {
    const nFlag = flags.findIndex(f => f === '-n');
    const interval = nFlag >= 0 ? (args[nFlag] ?? '2') : '2';
    const cmd = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    if (cmd) return `reruns '${trunc(cmd, 40)}' every ${interval}s and refreshes the display in-place (Ctrl-C to stop)`;
    return 'repeatedly runs a command and refreshes the terminal display';
  },
  'wc': (args, flags) => {
    const isLines = flags.includes('-l');
    const isWords = flags.includes('-w');
    const isChars = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    const what = isLines ? 'lines' : isWords ? 'words' : isChars ? 'characters' : 'lines, words, and bytes';
    return file ? `counts ${what} in '${file}'` : `counts ${what} in piped input`;
  },
  'zip': (args, flags) => {
    const isRecursive = flags.includes('-r');
    const pos = args.filter(a => !a.startsWith('-'));
    const [archive, ...srcs] = pos;
    if (!archive) return null;
    if (srcs.length === 1) return `${isRecursive ? 'recursively ' : ''}zips '${srcs[0]}' into '${archive}'`;
    if (srcs.length > 1) return `zips ${srcs.length} items into '${archive}'`;
    return `creates archive '${archive}'`;
  },

  // --- Text processing ---
  'awk': (args) => {
    const prog = args[0];
    const file = args[1];
    if (prog && file) return `processes '${file}' with the awk program — awk splits each line into fields ($1, $2…)`;
    if (prog) return 'processes piped input with the awk program — splits each line into fields ($1, $2…)';
    return null;
  },
  'crontab': (args, flags) => {
    const isEdit = flags.includes('-e');
    const isList = flags.includes('-l');
    const isRemove = flags.includes('-r');
    if (isEdit) return 'opens the cron job editor — each line schedules a recurring command using 5 time fields';
    if (isList) return 'prints all currently scheduled cron jobs for the current user';
    if (isRemove) return 'removes all cron jobs for the current user — this cannot be undone';
    return null;
  },
  'sed': (args, flags) => {
    const isInPlace = flags.some(f => f === '-i' || f.startsWith('-i'));
    const expr = args[0];
    const file = args[1];
    if (!expr) return null;
    const subMatch = expr.match(/^s\/(.*?)\/(.*?)\/(g?)$/);
    if (subMatch) {
      const [, from, to, global] = subMatch;
      const scope = global ? 'every occurrence' : 'the first occurrence per line';
      if (isInPlace && file) {
        return `replaces ${scope} of '${trunc(from, 20)}' with '${trunc(to, 20)}' — modifies '${file}' on disk`;
      }
      return `replaces ${scope} of '${trunc(from, 20)}' with '${trunc(to, 20)}' and prints the result`;
    }
    return file ? `transforms '${file}' using the sed script` : 'transforms piped text using the sed script';
  },
  'sort': (args, flags) => {
    const isReverse = flags.includes('-r') || flags.includes('--reverse');
    const isNumeric = flags.includes('-n') || flags.includes('--numeric-sort');
    const isUnique = flags.includes('-u') || flags.includes('--unique');
    const file = args.find(a => !a.startsWith('-'));
    const mods = [isNumeric && 'numerically', isReverse && 'in reverse', isUnique && 'removing duplicates']
      .filter(Boolean).join(', ');
    const modStr = mods ? ` (${mods})` : '';
    return file ? `sorts '${file}'${modStr}` : `sorts piped input${modStr}`;
  },
  'tee': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `writes piped input to both stdout and '${file}' simultaneously — useful to log and pass through at once` : null;
  },
  'tr': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [from, to] = pos;
    if (from && to) return `translates each character in '${trunc(from, 15)}' to the corresponding one in '${trunc(to, 15)}'`;
    return null;
  },
  'uniq': (args, flags) => {
    const isCount = flags.includes('-c');
    const isDupe = flags.includes('-d');
    const file = args.find(a => !a.startsWith('-'));
    if (isCount) return file ? `counts and collapses adjacent duplicate lines in '${file}'` : 'counts adjacent duplicate lines — pipe from sort for global deduplication';
    if (isDupe) return 'outputs only lines that appear more than once';
    return file ? `removes adjacent duplicate lines from '${file}' — sort first for full deduplication` : 'removes adjacent duplicate lines from input';
  },
  'xargs': (args, flags, subcommand) => {
    const cmd = subcommand ?? args[0];
    return cmd ? `runs '${cmd}' once for each item from stdin — turns piped list into command arguments` : 'builds and executes a command from stdin — converts newline-separated input into arguments';
  },

  // --- Network ---
  'curl': (args, flags, subcommand) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    const method = flags.includes('-X') ? subcommand : null;
    const isSilent = flags.includes('-s') || flags.includes('--silent');
    const isOutput = flags.includes('-o') || flags.includes('--output');
    const hasData = flags.includes('-d') || flags.includes('--data');
    const hasHeaders = flags.includes('-H') || flags.includes('--header');
    if (!url) return null;
    const base = method
      ? `sends an HTTP ${method} to '${trunc(url, 45)}'`
      : `makes a GET request to '${trunc(url, 45)}' and prints the response`;
    const extras = [
      hasData ? 'with request body' : null,
      hasHeaders ? 'with custom headers' : null,
      isSilent ? 'no progress bar' : null,
      isOutput ? 'saves response to file' : null,
    ].filter(Boolean).join(', ');
    return extras ? `${base} (${extras})` : base;
  },
  'dig': (args) => {
    const domain = args.find(a => !a.startsWith('-') && !a.startsWith('@'));
    return domain ? `queries DNS to look up the IP address(es) for '${domain}'` : 'queries DNS records';
  },
  'nc': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [host, port] = pos;
    if (host && port) return `opens a raw TCP connection to '${host}:${port}' — useful for testing ports or sending data`;
    return null;
  },
  'nmap': (args, flags) => {
    const target = args.find(a => !a.startsWith('-'));
    const isPing = flags.includes('-sn') || flags.includes('-sP');
    if (isPing && target) return `checks if '${target}' is reachable — ping only, no port scan`;
    if (target) return `scans '${target}' for open ports and guesses running services`;
    return null;
  },
  'ping': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const n = pos.find(a => /^\d+$/.test(a));
    const host = pos.find(a => !/^\d+$/.test(a));
    if (host && n) return `sends ${n} ICMP packets to '${host}' to measure reachability and round-trip time`;
    if (host) return `sends ICMP packets to '${host}' continuously — measures reachability and latency (Ctrl-C to stop)`;
    return null;
  },
  'rsync': (args, flags) => {
    const isDelete = flags.includes('--delete');
    const isDryRun = flags.includes('-n') || flags.includes('--dry-run');
    const pos = args.filter(a => !a.startsWith('-'));
    const [src, dest] = pos;
    if (isDryRun && src && dest) return `previews what would change syncing '${src}' to '${dest}' — nothing is transferred yet`;
    if (src && dest) return `efficiently syncs '${src}' to '${dest}' — only transfers files that changed${isDelete ? ', deletes extras at destination' : ''}`;
    return null;
  },
  'scp': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    return pos.length >= 2 ? `securely copies '${pos[0]}' to '${pos[1]}' over SSH` : null;
  },
  'ssh': (args, flags, subcommand) => {
    const target = args.find(a => !a.startsWith('-'));
    if (!target) return null;
    const remoteArgs = [subcommand, ...args.filter(a => a !== target && !a.startsWith('-'))].filter(Boolean);
    const remoteCmd = remoteArgs.join(' ');
    if (target.includes('@')) {
      const atIdx = target.indexOf('@');
      const user = target.slice(0, atIdx);
      const host = target.slice(atIdx + 1);
      if (remoteCmd) return `connects to '${host}' as '${user}' and runs: ${trunc(remoteCmd, 40)}`;
      return `opens an encrypted shell on '${host}' logged in as '${user}'`;
    }
    if (remoteCmd) return `connects to '${target}' and runs: ${trunc(remoteCmd, 40)}`;
    return `opens an encrypted remote shell on '${target}'`;
  },
  'wget': (args) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    return url ? `downloads '${trunc(url, 50)}' and saves it to the current directory` : null;
  },

  // --- System info ---
  'df': (args, flags) => {
    const isHuman = flags.includes('-h');
    const dir = args.find(a => !a.startsWith('-'));
    if (dir) return `shows free and used space on the filesystem containing '${dir}'${isHuman ? ' in GB/MB' : ''}`;
    return `shows free and used space on all mounted filesystems${isHuman ? ' in human-readable units' : ''}`;
  },
  'du': (args, flags) => {
    const isHuman = flags.includes('-h');
    const isSummary = flags.includes('-s');
    const dir = args.find(a => !a.startsWith('-'));
    if (dir && isSummary) return `shows total disk space used by '${dir}'${isHuman ? ' in human-readable units' : ''}`;
    if (dir) return `shows disk usage of each item under '${dir}'${isHuman ? ' in human-readable units' : ''}`;
    return 'shows disk usage of each item in the current directory';
  },
  'env': (args) => {
    const cmd = args.find(a => !a.startsWith('-') && !a.includes('='));
    return cmd ? `runs '${cmd}' with a modified environment — changes apply only to that process` : 'lists all environment variables currently set in this shell';
  },
  'export': (args) => {
    const assignment = args[0];
    if (!assignment) return null;
    const eq = assignment.indexOf('=');
    if (eq >= 0) {
      const name = assignment.slice(0, eq);
      const value = assignment.slice(eq + 1);
      if (name === 'PATH' && value.includes('$PATH')) {
        const added = value.replace(/\$PATH:?|:\$PATH/, '').replace(/^:|:$/, '');
        return `extends the shell's command search path — adds '${trunc(added, 40)}' so commands there can be run by name`;
      }
      return `sets env var '${name}' to '${trunc(value, 30)}' — visible to this shell and all child processes it spawns`;
    }
    return `marks '${assignment}' as an environment variable — child processes can read it`;
  },
  'file': (args) => {
    const target = args.find(a => !a.startsWith('-'));
    return target ? `detects the real type of '${target}' by inspecting its content — not just the file extension` : null;
  },
  'free': (args, flags) => {
    const isHuman = flags.includes('-h');
    return `shows total, used, and available RAM and swap${isHuman ? ' in human-readable units' : ''}`;
  },
  'id': (args) => {
    const user = args.find(a => !a.startsWith('-'));
    return user ? `shows the numeric UID, GID, and group membership for '${user}'` : 'shows your current user identity — UID, GID, and all group memberships';
  },
  'ps': (args, flags, subcommand) => {
    const combined = (subcommand ?? '') + flags.join('');
    const isAll = combined.includes('a') || combined.includes('e') || flags.includes('--all');
    if (isAll) return 'lists all running processes — shows PID, CPU/memory usage, and the command that launched each one';
    return 'lists processes running in the current terminal session';
  },
  'source': (args) => {
    const file = args[0];
    return file ? `runs '${file}' inside the current shell — any variables or functions it defines are immediately available` : null;
  },
  'sudo': (args, flags, subcommand) => {
    const cmd = subcommand ?? args[0];
    return cmd ? `runs '${cmd}' as root — system-wide changes, tread carefully` : 'runs the next command with root privileges';
  },
  'tar': (args, flags) => {
    const isCreate = flags.includes('-c') || flags.includes('--create');
    const isExtract = flags.includes('-x') || flags.includes('--extract');
    const isList = flags.includes('-t') || flags.includes('--list');
    const isGzip = flags.includes('-z');
    const isBzip = flags.includes('-j');
    const compression = isGzip ? ' (gzip compressed)' : isBzip ? ' (bzip2 compressed)' : '';
    const pos = args.filter(a => !a.startsWith('-'));
    const [archive, ...srcs] = pos;
    if (isCreate && archive && srcs.length) return `packs ${srcs.length} source(s) into '${archive}'${compression}`;
    if (isCreate && archive) return `creates archive '${archive}'${compression}`;
    if (isExtract && archive) return `unpacks all contents of '${archive}'${compression} into the current directory`;
    if (isList && archive) return `lists the contents of '${archive}' without extracting`;
    return null;
  },
  'uname': (args, flags) => {
    const isAll = flags.includes('-a') || flags.includes('--all');
    return isAll ? 'prints all system info — kernel name, hostname, release, architecture' : 'prints the kernel name';
  },
  'which': (args) => {
    const cmd = args.find(a => !a.startsWith('-'));
    return cmd ? `finds the full path of the '${cmd}' executable — shows which version runs when you type the command` : null;
  },
  'whoami': () => 'prints the username of the currently logged-in user',

  // --- Systemctl ---
  'systemctl start': (args) => {
    const svc = args[0];
    return svc ? `starts service '${svc}' now — does not enable it at boot` : null;
  },
  'systemctl stop': (args) => {
    const svc = args[0];
    return svc ? `stops service '${svc}' — it will still auto-start at next boot if enabled` : null;
  },
  'systemctl restart': (args) => {
    const svc = args[0];
    return svc ? `stops then starts '${svc}' — picks up config changes that need a full restart` : null;
  },
  'systemctl reload': (args) => {
    const svc = args[0];
    return svc ? `signals '${svc}' to reload its config without stopping — faster and connection-safe` : null;
  },
  'systemctl enable': (args) => {
    const svc = args[0];
    return svc ? `marks '${svc}' to auto-start at boot — does not start it immediately` : null;
  },
  'systemctl disable': (args) => {
    const svc = args[0];
    return svc ? `prevents '${svc}' from auto-starting at boot — does not stop it if currently running` : null;
  },
  'systemctl status': (args) => {
    const svc = args[0];
    return svc ? `shows whether '${svc}' is running, its PID, recent logs, and any errors` : 'shows overall system boot status and failed units';
  },
  'systemctl daemon-reload': () => 'reloads systemd unit files from disk — run this after editing a .service file',

  // --- Process ---
  'kill': (args, flags) => {
    const pids = args.filter(a => /^\d+$/.test(a));
    const pidStr = pids.length === 1 ? `process ${pids[0]}`
                 : pids.length > 1  ? `${pids.length} processes`
                 : null;
    if (!pidStr) return null;
    const sigFlag = flags.find(f => /^-(\d+|SIG\w+)$/.test(f));
    const sig = sigFlag ? sigFlag.slice(1) : null;
    if (sig === '9' || sig === 'SIGKILL' || sig === 'KILL') {
      return `force-kills ${pidStr} — SIGKILL cannot be caught or ignored, the OS tears it down with no cleanup`;
    }
    if (sig === '1' || sig === 'SIGHUP' || sig === 'HUP') {
      return `sends SIGHUP to ${pidStr} — most daemons interpret this as "reload config" without restarting`;
    }
    if (sig === '15' || sig === 'SIGTERM' || sig === 'TERM' || !sig) {
      return `politely asks ${pidStr} to shut down (SIGTERM) — the process can save state and clean up before exiting`;
    }
    return `sends signal ${sig} to ${pidStr}`;
  },
  'pkill': (args) => {
    const name = args.find(a => !a.startsWith('-'));
    return name ? `sends a termination signal to all processes whose name matches '${name}'` : null;
  },
  'killall': (args) => {
    const name = args.find(a => !a.startsWith('-'));
    return name ? `terminates all processes with the exact name '${name}'` : null;
  },

  // --- Shell / interpreter ---
  'bash': (args, flags) => {
    const isC = flags.includes('-c');
    const script = args.find(a => !a.startsWith('-'));
    if (isC && script) return `executes this shell command directly: ${trunc(script, 60)}`;
    if (script) return `runs shell script '${script}'`;
    return 'opens an interactive bash shell';
  },
  'sh': (args, flags) => {
    const isC = flags.includes('-c');
    const script = args.find(a => !a.startsWith('-'));
    if (isC && script) return `executes this POSIX shell command: ${trunc(script, 60)}`;
    if (script) return `runs shell script '${script}'`;
    return 'opens an interactive POSIX-compatible shell';
  },

  // --- Node / npm ---
  'node': (args, flags, subcommand) => {
    const script = args.find(a => !a.startsWith('-'));
    if (!script) return null;
    const rest = args.filter(a => a !== script && !a.startsWith('-'));
    const shellArg = rest.find(a => looksLikeShellCommand(a));
    if (subcommand && shellArg) {
      return `runs '${script}', passing '${subcommand}' and a shell command as arguments`;
    }
    if (subcommand && rest.length) {
      return `runs '${script}' with '${subcommand}' subcommand and ${rest.length} argument(s)`;
    }
    if (subcommand) return `runs '${script}' with '${subcommand}' subcommand`;
    if (rest.length === 1) return `runs '${script}' with argument: ${trunc(rest[0], 40)}`;
    if (rest.length > 1) return `runs '${script}' with ${rest.length} arguments`;
    return `runs Node.js script '${script}'`;
  },
  'npm ci': () => 'clean install from package-lock.json — faster and strictly reproducible, used in CI pipelines',
  'npm init': (args, flags) => {
    const isYes = flags.includes('-y') || flags.includes('--yes');
    return isYes ? 'creates a package.json with all defaults — skips the interactive prompts' : 'walks through creating a package.json interactively';
  },
  'npm install': (args, flags) => {
    const isDev = flags.includes('--save-dev') || flags.includes('-D');
    const isGlobal = flags.includes('-g') || flags.includes('--global');
    const packages = args.filter(a => !a.startsWith('-'));
    if (!packages.length) return 'installs all dependencies from package.json — creates node_modules and writes package-lock.json';
    const scope = isGlobal ? 'globally (system-wide)'
                : isDev ? 'as a dev dependency (excluded from production builds)'
                : 'as a production dependency';
    if (packages.length === 1) return `installs '${packages[0]}' ${scope} and records it in package.json`;
    return `installs ${packages.length} packages ${scope}`;
  },
  'npm link': (args) => {
    const pkg = args[0];
    return pkg ? `links global package '${pkg}' into this project — useful for local package development` : 'exposes this package globally as a symlink for local development testing';
  },
  'npm publish': () => 'publishes this package to the npm registry — makes it available to install by name',
  'npm run': (args) => {
    const script = args[0];
    return script ? `runs the '${script}' script defined in package.json scripts` : null;
  },
  'npm start': () => 'runs the start script defined in package.json — typically starts the app server',
  'npm test': () => 'runs the test suite defined in package.json',
  'npm uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `removes '${pkg}' from node_modules and package.json` : null;
  },
  'npx': (args, flags, subcommand) => {
    const pkg = subcommand ?? args[0];
    return pkg ? `runs '${pkg}' without a global install — downloads it temporarily if not present` : null;
  },

  // --- Python ---
  'python': (args, flags) => {
    const isC = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    if (isC && file) return `runs this Python expression inline: ${trunc(file, 60)}`;
    if (file) return `runs Python script '${file}'`;
    return 'starts an interactive Python REPL';
  },
  'python3': (args, flags) => {
    const isC = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    if (isC && file) return `runs this Python 3 expression inline: ${trunc(file, 60)}`;
    if (file) return `runs Python 3 script '${file}'`;
    return 'starts an interactive Python 3 REPL';
  },
  'pip install': (args, flags) => {
    const isUpgrade = flags.includes('-U') || flags.includes('--upgrade');
    const isReq = flags.includes('-r');
    const packages = args.filter(a => !a.startsWith('-'));
    if (isReq && packages[0]) return `installs all packages listed in '${packages[0]}' — typically requirements.txt`;
    if (!packages.length) return null;
    const verb = isUpgrade ? 'upgrades' : 'installs';
    return packages.length === 1 ? `${verb} '${packages[0]}' into the current Python environment` : `${verb} ${packages.length} packages`;
  },
  'pip uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `removes '${pkg}' from the current Python environment` : null;
  },
  'pip list': () => 'lists all packages installed in the current Python environment with their versions',
  'pip freeze': () => 'prints installed packages in requirements.txt format — pipe to a file to capture the environment',
  'pip3 install': (args, flags) => {
    const isUpgrade = flags.includes('-U') || flags.includes('--upgrade');
    const isReq = flags.includes('-r');
    const packages = args.filter(a => !a.startsWith('-'));
    if (isReq && packages[0]) return `installs all packages listed in '${packages[0]}'`;
    if (!packages.length) return null;
    const verb = isUpgrade ? 'upgrades' : 'installs';
    return packages.length === 1 ? `${verb} '${packages[0]}' via pip3` : `${verb} ${packages.length} packages via pip3`;
  },
  'pip3 uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `removes '${pkg}' from the Python 3 environment` : null;
  },

  // --- Package managers: apt ---
  'apt install': (args) => {
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    return pkgs.length === 1 ? `installs '${pkgs[0]}' and any required dependencies from the apt repository` : `installs ${pkgs.length} packages from the apt repository`;
  },
  'apt remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removes '${pkg}' — config files are kept (use purge to remove those too)` : null;
  },
  'apt update': () => 'refreshes the local package index from all configured repositories — run before apt install to get the latest versions',
  'apt upgrade': () => 'upgrades all installed packages to their latest available versions',
  'apt-get install': (args) => {
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    return pkgs.length === 1 ? `installs '${pkgs[0]}' and its dependencies` : `installs ${pkgs.length} packages`;
  },
  'apt-get remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removes '${pkg}' — config files are kept` : null;
  },
  'apt-get update': () => 'refreshes the local package index from configured repositories',
  'apt-get upgrade': () => 'upgrades all installed packages to their newest versions',

  // --- yarn ---
  'yarn add': (args, flags) => {
    const isDev = flags.includes('--dev') || flags.includes('-D');
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    const scope = isDev ? 'as a dev dependency' : 'as a dependency';
    return pkgs.length === 1 ? `adds '${pkgs[0]}' ${scope} and records it in package.json` : `adds ${pkgs.length} packages ${scope}`;
  },
  'yarn remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removes '${pkg}' from node_modules and package.json` : null;
  },
  'yarn install': () => 'installs all dependencies from yarn.lock — exact versions, fully reproducible',
  'yarn run': (args, flags, subcommand) => {
    const script = subcommand ?? args[0];
    return script ? `runs the '${script}' script from package.json` : null;
  },
  'yarn build': () => 'runs the build script from package.json — compiles and bundles the project',
  'yarn test': () => 'runs the test suite via the test script in package.json',

  // --- cargo ---
  'cargo build': (args, flags) => {
    const isRelease = flags.includes('--release');
    return isRelease ? 'compiles with full optimizations — slower build, smaller and faster binary' : 'compiles in debug mode — fast build with extra runtime checks';
  },
  'cargo run': (args, flags) => {
    const isRelease = flags.includes('--release');
    return `builds then immediately runs the binary${isRelease ? ' (release build, optimized)' : ' (debug build)'}`;
  },
  'cargo test': (args) => {
    const test = args[0];
    return test ? `runs tests whose names contain '${test}'` : 'compiles and runs the full test suite';
  },
  'cargo add': (args) => {
    const pkg = args[0];
    return pkg ? `adds '${pkg}' to Cargo.toml and downloads it — no manual TOML editing needed` : null;
  },
  'cargo new': (args, flags) => {
    const name = args.find(a => !a.startsWith('-'));
    const isLib = flags.includes('--lib');
    return name ? `scaffolds a new ${isLib ? 'library' : 'binary'} Rust project named '${name}' with Cargo.toml and src/` : null;
  },
  'cargo check': () => 'checks the code for errors without producing a binary — much faster than a full build',
  'cargo clippy': () => 'runs Clippy — Rust\'s linter that catches common mistakes and suggests idiomatic patterns',
  'cargo fmt': () => 'auto-formats all Rust source files to the standard rustfmt style',

  // --- Docker ---
  'docker build': (args, flags) => {
    const tag = args.find(a => !a.startsWith('-') && a !== '.');
    return tag ? `builds a Docker image tagged '${tag}' from the Dockerfile in the current directory` : 'builds a Docker image from the Dockerfile in the current directory';
  },
  'docker exec': (args, flags) => {
    const isInteractive = flags.includes('-it') || (flags.includes('-i') && flags.includes('-t'));
    const container = args.find(a => !a.startsWith('-'));
    const cmd = args.filter(a => !a.startsWith('-') && a !== container).join(' ');
    if (isInteractive && container) return `opens an interactive shell inside running container '${container}'`;
    return container ? `runs a command inside container '${container}'` : null;
  },
  'docker images': () => 'lists all Docker images stored locally — shows name, tag, size, and age',
  'docker logs': (args, flags) => {
    const isFollow = flags.includes('-f') || flags.includes('--follow');
    const container = args.find(a => !a.startsWith('-'));
    if (isFollow && container) return `streams live log output from '${container}' — follows new lines as they are written (Ctrl-C to stop)`;
    if (container) return `shows the log output from container '${container}'`;
    return null;
  },
  'docker ps': (args, flags) => {
    const isAll = flags.includes('-a') || flags.includes('--all');
    return isAll ? 'lists all containers including stopped ones — shows status, ports, and names' : 'lists currently running containers';
  },
  'docker pull': (args) => {
    const image = args.find(a => !a.startsWith('-'));
    return image ? `downloads image '${image}' from the container registry to local storage` : null;
  },
  'docker push': (args) => {
    const image = args.find(a => !a.startsWith('-'));
    return image ? `uploads image '${image}' to the registry — makes it available for others to pull` : null;
  },
  'docker rm': (args) => {
    const containers = args.filter(a => !a.startsWith('-'));
    if (containers.length === 1) return `removes stopped container '${containers[0]}' — frees disk space`;
    if (containers.length > 1) return `removes ${containers.length} stopped containers`;
    return null;
  },
  'docker run': (args, flags) => {
    const isDetached = flags.includes('-d') || flags.includes('--detach');
    const isRemove = flags.includes('--rm');
    const portMappings = args.filter(a => /^\d+:\d+$/.test(a));
    const pos = args.filter(a => !a.startsWith('-') && !/^\d+:\d+$/.test(a));
    const image = pos[pos.length - 1];
    if (!image) return null;
    const parts = [
      isDetached ? 'runs in the background' : null,
      isRemove ? 'auto-removes container when it exits' : null,
      portMappings.length === 1
        ? `maps host:${portMappings[0].split(':')[0]} → container:${portMappings[0].split(':')[1]}`
        : portMappings.length > 1
        ? `maps ${portMappings.length} ports`
        : null,
    ].filter(Boolean);
    const extra = parts.length ? ` — ${parts.join(', ')}` : '';
    return `creates and starts a new container from image '${image}'${extra}`;
  },
  'docker stop': (args) => {
    const container = args.find(a => !a.startsWith('-'));
    return container ? `gracefully stops '${container}' — sends SIGTERM then SIGKILL after a timeout` : null;
  },
};

export function getArgumentContext(command, subcommand, args, flags = []) {
  const key = subcommand ? `${command} ${subcommand}` : command;
  const handler = HANDLERS[key] ?? HANDLERS[command];
  // Pass subcommand as third arg so handlers like xargs, sudo, npx can use it
  return handler ? handler(args, flags, subcommand) : null;
}
