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

const HANDLERS = {
  // --- git ---
  'git add': (args, flags) => {
    const isAll = flags.includes('-A') || flags.includes('--all') || args.includes('.');
    if (isAll || args[0] === '.') return 'staging all changes';
    if (args.length === 1) return `staging '${args[0]}'`;
    if (args.length > 1) return `staging ${args.length} files`;
    return null;
  },
  'git branch': (args, flags) => {
    const name = args[0];
    const isDelete = flags.some(f => ['-d', '-D', '--delete'].includes(f));
    if (isDelete && name) return `deleting branch '${name}'`;
    if (name) return `creating branch '${name}'`;
    return 'listing local branches';
  },
  'git cherry-pick': (args) => {
    const commit = args[0];
    return commit ? `applying commit '${trunc(commit, 12)}' onto current branch` : null;
  },
  'git checkout': (args, flags) => {
    const target = args[0];
    if (!target) return null;
    const isNew = flags.includes('-b') || flags.includes('-B');
    return isNew ? `creating and switching to branch '${target}'` : `switching to '${target}'`;
  },
  'git clean': (args, flags) => {
    const isDry = flags.includes('-n') || flags.includes('--dry-run');
    if (isDry) return 'previewing untracked files that would be removed';
    return 'removing untracked files from the working tree';
  },
  'git clone': (args) => {
    const [url, dest] = args;
    if (url && dest) return `cloning '${trunc(url, 40)}' into '${dest}'`;
    if (url) return `cloning from '${trunc(url, 40)}'`;
    return null;
  },
  'git commit': (args, flags) => {
    const isAmend = flags.includes('--amend');
    const isAll = flags.includes('-a');
    const msg = args[0];
    if (isAmend && msg) return `rewrites the most recent commit with new message: '${trunc(msg, 35)}'`;
    if (isAmend) return 'rewrites the most recent commit (change its message or staged content)';
    if (msg && isAll) return `stages all tracked changes and creates a commit: '${trunc(msg, 35)}'`;
    if (msg) return `creates a new commit with message: '${trunc(msg, 35)}'`;
    if (isAll) return 'stages every modified tracked file and opens the commit message editor';
    return null;
  },
  'git config': (args, flags) => {
    const isGlobal = flags.includes('--global');
    const isUnset = flags.includes('--unset');
    const isList = flags.includes('-l') || flags.includes('--list');
    const scope = isGlobal ? 'global ' : '';
    if (isList) return `listing all ${scope}git config values`;
    if (isUnset && args[0]) return `removing ${scope}config '${args[0]}'`;
    if (args[0] && args[1]) return `setting ${scope}'${args[0]}' = '${trunc(args[1], 30)}'`;
    if (args[0]) return `reading ${scope}config '${args[0]}'`;
    return null;
  },
  'git diff': (args) => {
    if (!args.length) return 'showing unstaged changes';
    if (args[0] === '--staged' || args[0] === '--cached') return 'showing staged changes';
    if (args.length === 1) return `diffing against '${args[0]}'`;
    return null;
  },
  'git fetch': (args, flags) => {
    const remote = args[0];
    const isAll = flags.includes('--all');
    const isPrune = flags.includes('--prune') || flags.includes('-p');
    if (isAll) return 'fetching from all remotes';
    if (remote && isPrune) return `fetching from '${remote}' and pruning deleted branches`;
    if (remote) return `fetching from '${remote}'`;
    return 'fetching updates from origin';
  },
  'git init': (args) => {
    const dir = args[0];
    return dir ? `initializing git repo in '${dir}'` : 'initializing git repo in current directory';
  },
  'git log': (args, flags) => {
    const n = flags.find(f => /^-\d+$/.test(f));
    if (n) return `showing last ${n.slice(1)} commits`;
    if (args[0]) return `showing log for '${args[0]}'`;
    return null;
  },
  'git merge': (args) => {
    const branch = args[0];
    return branch ? `merging '${branch}' into current branch` : null;
  },
  'git mv': (args) => {
    const [src, dest] = args;
    return src && dest ? `renaming '${src}' to '${dest}'` : null;
  },
  'git pull': (args) => {
    const [remote, branch] = args;
    if (remote && branch) return `pulling '${branch}' from '${remote}'`;
    if (remote) return `pulling from '${remote}'`;
    return null;
  },
  'git push': (args, flags) => {
    const [remote, branch] = args;
    if (remote && branch) return `pushing local '${branch}' to remote '${remote}'`;
    if (remote) return `pushing to remote '${remote}'`;
    return null;
  },
  'git rebase': (args, flags) => {
    const target = args[0];
    const isInteractive = flags.includes('-i') || flags.includes('--interactive');
    if (target && isInteractive) return `interactively rebasing onto '${target}'`;
    if (target) return `rebasing current branch onto '${target}'`;
    return null;
  },
  'git remote': (args) => {
    const sub = args[0];
    if (sub === 'add') return args[1] && args[2] ? `adding remote '${args[1]}' at '${trunc(args[2], 35)}'` : 'adding a remote';
    if (sub === 'remove' || sub === 'rm') return args[1] ? `removing remote '${args[1]}'` : 'removing a remote';
    if (sub === 'set-url') return args[1] ? `changing URL of remote '${args[1]}'` : 'changing remote URL';
    return 'listing remotes';
  },
  'git restore': (args, flags) => {
    const isStaged = flags.includes('--staged');
    const file = args[0];
    if (isStaged && file) return `unstaging '${file}'`;
    if (isStaged) return 'unstaging changes';
    if (file) return `discarding working-tree changes in '${file}'`;
    return null;
  },
  'git rm': (args, flags) => {
    const isCached = flags.includes('--cached');
    const file = args[0];
    if (isCached && file) return `untracking '${file}' (file stays on disk)`;
    if (file) return `removing '${file}' from tracking and disk`;
    return null;
  },
  'git show': (args) => {
    const ref = args[0];
    return ref ? `showing details of '${trunc(ref, 20)}'` : 'showing the latest commit';
  },
  'git stash': (args) => {
    const sub = args[0];
    if (sub === 'pop') return 'restoring and removing the most recent stash';
    if (sub === 'apply') return 'applying the stash without removing it';
    if (sub === 'drop') return 'discarding the most recent stash';
    if (sub === 'list') return 'listing all stashes';
    if (sub === 'show') return 'showing stash diff';
    if (!sub) return 'saving current changes to the stash';
    return null;
  },
  'git status': (args, flags) => {
    const isShort = flags.includes('-s') || flags.includes('--short');
    return isShort ? 'showing working tree status (short format)' : 'showing working tree status';
  },
  'git switch': (args, flags) => {
    const target = args[0];
    const isNew = flags.includes('-c') || flags.includes('-C') || flags.includes('--create');
    if (isNew && target) return `creating and switching to branch '${target}'`;
    if (target) return `switching to branch '${target}'`;
    return null;
  },
  'git tag': (args, flags) => {
    const isDelete = flags.includes('-d') || flags.includes('--delete');
    const name = args[0];
    if (isDelete && name) return `deleting tag '${name}'`;
    if (name) return `creating tag '${name}'`;
    return 'listing tags';
  },

  // --- File ops ---
  'cat': (args) => {
    const files = args.filter(a => !a.startsWith('-'));
    if (files.length === 1) return `reading '${files[0]}'`;
    if (files.length > 1) return `reading and concatenating ${files.length} files`;
    return null;
  },
  'cd': (args) => {
    const dir = args[0];
    return dir ? `changing to '${dir}'` : 'changing to home directory';
  },
  'chmod': (args, flags) => {
    const isRecursive = flags.includes('-R') || flags.includes('-r') || flags.includes('--recursive');
    const pos = args.filter(a => !a.startsWith('-'));
    const [mode, ...targets] = pos;
    if (!mode || !targets.length) return null;
    const extra = targets.length > 1 ? ` (+${targets.length - 1} more)` : '';
    return `${isRecursive ? 'recursively ' : ''}setting permissions '${mode}' on '${targets[0]}'${extra}`;
  },
  'chown': (args, flags) => {
    const isRecursive = flags.includes('-R') || flags.includes('--recursive');
    const pos = args.filter(a => !a.startsWith('-'));
    const [owner, target] = pos;
    return owner && target
      ? `${isRecursive ? 'recursively ' : ''}changing owner to '${owner}' on '${target}'`
      : null;
  },
  'cp': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    if (pos.length < 2) return null;
    const dest = pos[pos.length - 1];
    const srcs = pos.slice(0, -1);
    return srcs.length === 1
      ? `copying '${srcs[0]}' to '${dest}'`
      : `copying ${srcs.length} items to '${dest}'`;
  },
  'diff': (args, flags) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [a, b] = pos;
    const isRecursive = flags.includes('-r') || flags.includes('--recursive');
    if (a && b) return `${isRecursive ? 'recursively ' : ''}comparing '${a}' with '${b}'`;
    return null;
  },
  'find': (args, flags, subcommand) => {
    // Starting directory may land in subcommand (e.g. "find src ...") or args (e.g. "find . ...")
    const allPos = [subcommand, ...args].filter(Boolean);
    const dir = allPos.find(a => !a.startsWith('-'));
    let pattern = null;
    let type = null;

    if (flags.includes('-name')) {
      // -name kept whole as a 4-char flag; its value is first non-dir in args
      pattern = args.filter(a => !a.startsWith('-') && a !== dir)[0] ?? null;
    } else {
      const idx = args.indexOf('-name');
      if (idx >= 0) pattern = args[idx + 1] ?? null;
    }

    if (flags.includes('-type')) {
      // -type value is first single-char arg that looks like f/d
      type = args.find(a => /^[fd]$/.test(a)) ?? null;
    } else {
      const idx = args.indexOf('-type');
      if (idx >= 0) type = args[idx + 1] ?? null;
    }

    const typeDesc = type === 'f' ? 'files' : type === 'd' ? 'directories' : null;
    if (dir && pattern && typeDesc) return `searching in '${dir}' for ${typeDesc} matching '${pattern}'`;
    if (dir && pattern) return `searching in '${dir}' for files matching '${pattern}'`;
    if (dir) return `searching in '${dir}'`;
    return null;
  },
  'grep': (args, flags, subcommand) => {
    const isRecursive = flags.includes('-r') || flags.includes('-R') || flags.includes('--recursive');
    const isInvert = flags.includes('-v') || flags.includes('--invert-match');
    const isCaseInsensitive = flags.includes('-i') || flags.includes('--ignore-case');
    const pos = args.filter(a => !a.startsWith('-'));
    // The tokenizer treats the first bare word as subcommand, so the pattern often lands there
    const pattern = subcommand ?? pos[0];
    const files = subcommand ? pos : pos.slice(1);
    if (!pattern) return null;
    const mods = [
      isInvert ? 'inverted (non-matching lines)' : null,
      isCaseInsensitive ? 'case-insensitive' : null,
    ].filter(Boolean).join(', ');
    const modStr = mods ? ` — ${mods}` : '';
    if (isRecursive && files.length) return `searches every file under '${files[0]}' and prints lines matching '${pattern}'${modStr}`;
    if (files.length === 1) return `prints lines from '${files[0]}' that match '${pattern}'${modStr}`;
    if (files.length > 1) return `prints matching lines from ${files.length} files for pattern '${pattern}'${modStr}`;
    // No file arg means it's reading from a pipe
    return `filters the piped input, printing only lines that contain '${pattern}'${modStr}`;
  },
  'head': (args, flags) => {
    const n = args.find(a => /^\d+$/.test(a));
    const file = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    if (n && file) return `showing first ${n} lines of '${file}'`;
    if (file) return `showing first 10 lines of '${file}'`;
    if (n) return `showing first ${n} lines of input`;
    return null;
  },
  'ln': (args, flags) => {
    const isSymlink = flags.includes('-s') || flags.includes('--symbolic');
    const pos = args.filter(a => !a.startsWith('-'));
    const [src, dest] = pos;
    if (isSymlink && src && dest) return `creating symlink '${dest}' → '${src}'`;
    if (isSymlink && src) return `creating symlink to '${src}'`;
    if (src && dest) return `creating hard link '${dest}' → '${src}'`;
    return null;
  },
  'ls': (args) => {
    const dirs = args.filter(a => !a.startsWith('-'));
    if (dirs.length === 1) return `listing contents of '${dirs[0]}'`;
    if (dirs.length > 1) return `listing ${dirs.length} directories`;
    return null;
  },
  'mkdir': (args, flags) => {
    const isParents = flags.includes('-p') || flags.includes('--parents');
    const dir = args.find(a => !a.startsWith('-'));
    if (!dir) return null;
    return `creating directory '${dir}'${isParents ? ' (and any missing parents)' : ''}`;
  },
  'mv': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    if (pos.length < 2) return null;
    return `moving '${pos[0]}' to '${pos[pos.length - 1]}'`;
  },
  'rm': (args) => {
    const targets = args.filter(a => !a.startsWith('-'));
    if (targets.length === 1) return `deleting '${targets[0]}'`;
    if (targets.length > 1) return `deleting ${targets.length} items`;
    return null;
  },
  'tail': (args, flags) => {
    const isFollow = flags.includes('-f') || flags.includes('--follow');
    const n = args.find(a => /^\d+$/.test(a));
    const file = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    if (isFollow && file) return `continuously streams '${file}' — prints each new line as it is written to the file (stays open, Ctrl-C to stop)`;
    if (n && file) return `prints the last ${n} lines of '${file}'`;
    if (file) return `prints the last 10 lines of '${file}'`;
    return null;
  },
  'touch': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `creating or updating timestamp of '${file}'` : null;
  },
  'unzip': (args) => {
    const archive = args.find(a => !a.startsWith('-'));
    return archive ? `extracting '${archive}'` : null;
  },
  'wc': (args, flags) => {
    const isLines = flags.includes('-l');
    const isWords = flags.includes('-w');
    const isChars = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    const what = isLines ? 'lines' : isWords ? 'words' : isChars ? 'characters' : 'lines, words, and bytes';
    return file ? `counting ${what} in '${file}'` : `counting ${what} from input`;
  },
  'zip': (args, flags) => {
    const isRecursive = flags.includes('-r');
    const pos = args.filter(a => !a.startsWith('-'));
    const [archive, ...srcs] = pos;
    if (!archive) return null;
    if (srcs.length === 1) return `${isRecursive ? 'recursively ' : ''}zipping '${srcs[0]}' into '${archive}'`;
    if (srcs.length > 1) return `zipping ${srcs.length} items into '${archive}'`;
    return `creating archive '${archive}'`;
  },

  // --- Text processing ---
  'awk': (args) => {
    const prog = args[0];
    const file = args[1];
    if (prog && file) return `processing '${file}' with awk`;
    if (prog) return 'processing input with awk';
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
      const scope = global ? 'every occurrence' : 'the first occurrence';
      if (isInPlace && file) {
        return `replaces ${scope} of '${trunc(from, 20)}' with '${trunc(to, 20)}' directly inside '${file}' (file is modified on disk)`;
      }
      return `replaces ${scope} of '${trunc(from, 20)}' with '${trunc(to, 20)}' in the output`;
    }
    return file ? `processes '${file}' with the sed expression` : 'processes piped input with the sed expression';
  },
  'sort': (args, flags) => {
    const isReverse = flags.includes('-r') || flags.includes('--reverse');
    const isNumeric = flags.includes('-n') || flags.includes('--numeric-sort');
    const isUnique = flags.includes('-u') || flags.includes('--unique');
    const file = args.find(a => !a.startsWith('-'));
    const mods = [isNumeric && 'numerically', isReverse && 'in reverse', isUnique && 'removing duplicates']
      .filter(Boolean).join(', ');
    const modStr = mods ? ` (${mods})` : '';
    return file ? `sorting '${file}'${modStr}` : `sorting input${modStr}`;
  },
  'tee': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `writing output to both stdout and '${file}'` : null;
  },
  'tr': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [from, to] = pos;
    if (from && to) return `translating '${trunc(from, 15)}' → '${trunc(to, 15)}'`;
    return null;
  },
  'uniq': (args, flags) => {
    const isCount = flags.includes('-c');
    const isDupe = flags.includes('-d');
    const file = args.find(a => !a.startsWith('-'));
    if (isCount) return file ? `counting duplicate lines in '${file}'` : 'counting duplicate lines';
    if (isDupe) return 'showing only duplicate lines';
    return file ? `removing adjacent duplicates from '${file}'` : 'removing adjacent duplicate lines';
  },
  'xargs': (args, flags, subcommand) => {
    const cmd = subcommand ?? args[0];
    return cmd ? `running '${cmd}' for each line of input` : 'building and running a command from input';
  },

  // --- Network ---
  'curl': (args, flags, subcommand) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    // -X POST causes "POST" to land as subcommand (bare word after -X)
    const method = flags.includes('-X') ? subcommand : null;
    const isSilent = flags.includes('-s') || flags.includes('--silent');
    const isOutput = flags.includes('-o') || flags.includes('--output');
    if (!url) return null;
    const base = method ? `sends a ${method} request to '${trunc(url, 50)}'`
                        : `makes an HTTP GET request to '${trunc(url, 50)}'`;
    const extras = [
      isSilent ? 'suppresses progress output' : null,
      isOutput ? 'saves the response to a file' : null,
    ].filter(Boolean).join(', ');
    return extras ? `${base} (${extras})` : base;
  },
  'dig': (args) => {
    const domain = args.find(a => !a.startsWith('-') && !a.startsWith('@'));
    return domain ? `looking up DNS records for '${domain}'` : 'querying DNS';
  },
  'nc': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [host, port] = pos;
    if (host && port) return `connecting to '${host}' on port ${port}`;
    return null;
  },
  'nmap': (args, flags) => {
    const target = args.find(a => !a.startsWith('-'));
    const isPing = flags.includes('-sn') || flags.includes('-sP');
    if (isPing && target) return `pinging '${target}' (no port scan)`;
    if (target) return `scanning ports on '${target}'`;
    return null;
  },
  'ping': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const n = pos.find(a => /^\d+$/.test(a));
    const host = pos.find(a => !/^\d+$/.test(a));
    if (host && n) return `pinging '${host}' ${n} times`;
    if (host) return `pinging '${host}'`;
    return null;
  },
  'rsync': (args, flags) => {
    const isDelete = flags.includes('--delete');
    const isDryRun = flags.includes('-n') || flags.includes('--dry-run');
    const pos = args.filter(a => !a.startsWith('-'));
    const [src, dest] = pos;
    if (isDryRun && src && dest) return `previewing sync from '${src}' to '${dest}'`;
    if (src && dest) return `syncing '${src}' to '${dest}'${isDelete ? ' (deleting extras at dest)' : ''}`;
    return null;
  },
  'scp': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    return pos.length >= 2 ? `copying '${pos[0]}' to '${pos[1]}'` : null;
  },
  'ssh': (args) => {
    const target = args.find(a => !a.startsWith('-'));
    return target ? `connecting to '${target}'` : null;
  },
  'wget': (args) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    return url ? `downloading '${trunc(url, 50)}'` : null;
  },

  // --- System info ---
  'df': (args, flags) => {
    const isHuman = flags.includes('-h');
    const dir = args.find(a => !a.startsWith('-'));
    if (dir) return `showing disk space for '${dir}'${isHuman ? ' (human-readable)' : ''}`;
    return `showing disk space usage${isHuman ? ' (human-readable)' : ''}`;
  },
  'du': (args, flags) => {
    const isHuman = flags.includes('-h');
    const isSummary = flags.includes('-s');
    const dir = args.find(a => !a.startsWith('-'));
    if (dir && isSummary) return `showing total size of '${dir}'${isHuman ? ' (human-readable)' : ''}`;
    if (dir) return `showing disk usage under '${dir}'`;
    return 'showing disk usage of current directory';
  },
  'env': (args) => {
    const cmd = args.find(a => !a.startsWith('-') && !a.includes('='));
    return cmd ? `running '${cmd}' with modified environment` : 'listing all environment variables';
  },
  'export': (args) => {
    const assignment = args[0];
    if (!assignment) return null;
    const eq = assignment.indexOf('=');
    if (eq >= 0) {
      const name = assignment.slice(0, eq);
      const value = assignment.slice(eq + 1);
      return `exporting env var '${name}' = '${trunc(value, 30)}'`;
    }
    return `exporting '${assignment}' to the environment`;
  },
  'file': (args) => {
    const target = args.find(a => !a.startsWith('-'));
    return target ? `detecting file type of '${target}'` : null;
  },
  'free': (args, flags) => {
    const isHuman = flags.includes('-h');
    return `showing memory usage${isHuman ? ' (human-readable)' : ''}`;
  },
  'id': (args) => {
    const user = args.find(a => !a.startsWith('-'));
    return user ? `showing UID/GID for user '${user}'` : 'showing current user and group identity';
  },
  'ps': (args, flags, subcommand) => {
    // ps aux → subcommand='aux'; ps -ef → flags=['-e','-f']
    const combined = (subcommand ?? '') + flags.join('');
    const isAll = combined.includes('a') || combined.includes('e') || flags.includes('--all');
    if (isAll) return 'listing all running processes';
    return 'listing processes for current session';
  },
  'source': (args) => {
    const file = args[0];
    return file ? `loading '${file}' into current shell` : null;
  },
  'sudo': (args, flags, subcommand) => {
    const cmd = subcommand ?? args[0];
    return cmd ? `running '${cmd}' with root privileges` : 'running next command as root';
  },
  'tar': (args, flags) => {
    const isCreate = flags.includes('-c') || flags.includes('--create');
    const isExtract = flags.includes('-x') || flags.includes('--extract');
    const isList = flags.includes('-t') || flags.includes('--list');
    const isGzip = flags.includes('-z');
    const isBzip = flags.includes('-j');
    const compression = isGzip ? ' (gzip)' : isBzip ? ' (bzip2)' : '';
    const pos = args.filter(a => !a.startsWith('-'));
    const [archive, ...srcs] = pos;
    if (isCreate && archive && srcs.length) return `creating archive '${archive}'${compression} from ${srcs.length} source(s)`;
    if (isCreate && archive) return `creating archive '${archive}'${compression}`;
    if (isExtract && archive) return `extracting '${archive}'${compression}`;
    if (isList && archive) return `listing contents of '${archive}'`;
    return null;
  },
  'uname': (args, flags) => {
    const isAll = flags.includes('-a') || flags.includes('--all');
    return isAll ? 'showing all system info (kernel, arch, OS)' : 'showing kernel name';
  },
  'which': (args) => {
    const cmd = args.find(a => !a.startsWith('-'));
    return cmd ? `finding the path of '${cmd}'` : null;
  },
  'whoami': () => 'showing the current logged-in user name',

  // --- Systemctl ---
  'systemctl start': (args) => {
    const svc = args[0];
    return svc ? `starting service '${svc}'` : null;
  },
  'systemctl stop': (args) => {
    const svc = args[0];
    return svc ? `stopping service '${svc}'` : null;
  },
  'systemctl restart': (args) => {
    const svc = args[0];
    return svc ? `restarting service '${svc}'` : null;
  },
  'systemctl reload': (args) => {
    const svc = args[0];
    return svc ? `reloading '${svc}' config without restart` : null;
  },
  'systemctl enable': (args) => {
    const svc = args[0];
    return svc ? `enabling '${svc}' to auto-start at boot` : null;
  },
  'systemctl disable': (args) => {
    const svc = args[0];
    return svc ? `disabling '${svc}' from auto-starting at boot` : null;
  },
  'systemctl status': (args) => {
    const svc = args[0];
    return svc ? `checking status of '${svc}'` : 'showing overall system status';
  },
  'systemctl daemon-reload': () => 'reloading systemd unit files from disk',

  // --- Process ---
  'kill': (args) => {
    const pids = args.filter(a => !a.startsWith('-'));
    if (pids.length === 1) return `sending signal to process ${pids[0]}`;
    if (pids.length > 1) return `sending signal to ${pids.length} processes`;
    return null;
  },
  'pkill': (args) => {
    const name = args.find(a => !a.startsWith('-'));
    return name ? `killing processes named '${name}'` : null;
  },
  'killall': (args) => {
    const name = args.find(a => !a.startsWith('-'));
    return name ? `killing all processes named '${name}'` : null;
  },

  // --- Shell / interpreter ---
  'bash': (args, flags) => {
    const isC = flags.includes('-c');
    const script = args.find(a => !a.startsWith('-'));
    if (isC && script) return `runs this shell command directly: ${trunc(script, 60)}`;
    if (script) return `runs shell script '${script}'`;
    return 'starts an interactive bash shell';
  },
  'sh': (args, flags) => {
    const isC = flags.includes('-c');
    const script = args.find(a => !a.startsWith('-'));
    if (isC && script) return `runs this POSIX shell command: ${trunc(script, 60)}`;
    if (script) return `runs shell script '${script}'`;
    return 'starts an interactive POSIX shell';
  },

  // --- Node / npm ---
  'node': (args, flags, subcommand) => {
    const script = args.find(a => !a.startsWith('-'));
    if (!script) return null;
    const rest = args.filter(a => a !== script && !a.startsWith('-'));
    // Detect when an argument is itself a shell command string (was quoted in the original command)
    const shellArg = rest.find(a => looksLikeShellCommand(a));
    if (subcommand && shellArg) {
      return `runs '${script}', calling its '${subcommand}' command on: ${trunc(shellArg, 50)}`;
    }
    if (subcommand && rest.length) {
      return `runs '${script}' — '${subcommand}' subcommand with ${rest.length} argument(s)`;
    }
    if (subcommand) return `runs '${script}' with '${subcommand}' subcommand`;
    if (rest.length === 1) return `runs '${script}' with argument: ${trunc(rest[0], 40)}`;
    if (rest.length > 1) return `runs '${script}' with ${rest.length} arguments`;
    return `runs Node.js script '${script}'`;
  },
  'npm ci': () => 'clean install from package-lock.json (faster, reproducible)',
  'npm init': (args, flags) => {
    const isYes = flags.includes('-y') || flags.includes('--yes');
    return isYes ? 'initializing package.json with defaults' : 'creating package.json interactively';
  },
  'npm install': (args) => {
    const packages = args.filter(a => !a.startsWith('-'));
    if (!packages.length) return 'installing all dependencies from package.json';
    if (packages.length === 1) return `installing '${packages[0]}'`;
    return `installing ${packages.length} packages`;
  },
  'npm link': (args) => {
    const pkg = args[0];
    return pkg ? `linking global '${pkg}' into this project` : 'linking this package globally for development';
  },
  'npm publish': () => 'publishing this package to the npm registry',
  'npm run': (args) => {
    const script = args[0];
    return script ? `running npm script '${script}'` : null;
  },
  'npm start': () => 'running the start script',
  'npm test': () => 'running the test suite',
  'npm uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `removing '${pkg}'` : null;
  },
  'npx': (args, flags, subcommand) => {
    const pkg = subcommand ?? args[0];
    return pkg ? `running '${pkg}' without installing globally` : null;
  },

  // --- Python ---
  'python': (args, flags) => {
    const isC = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    if (isC && file) return `runs this Python code inline: ${trunc(file, 60)}`;
    if (file) return `runs Python script '${file}'`;
    return 'starts an interactive Python session';
  },
  'python3': (args, flags) => {
    const isC = flags.includes('-c');
    const file = args.find(a => !a.startsWith('-'));
    if (isC && file) return `runs this Python 3 code inline: ${trunc(file, 60)}`;
    if (file) return `runs Python 3 script '${file}'`;
    return 'starts an interactive Python 3 session';
  },
  'pip install': (args, flags) => {
    const isUpgrade = flags.includes('-U') || flags.includes('--upgrade');
    const isReq = flags.includes('-r');
    const packages = args.filter(a => !a.startsWith('-'));
    if (isReq && packages[0]) return `installing packages from '${packages[0]}'`;
    if (!packages.length) return null;
    const verb = isUpgrade ? 'upgrading' : 'installing';
    return packages.length === 1 ? `${verb} '${packages[0]}'` : `${verb} ${packages.length} packages`;
  },
  'pip uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `uninstalling '${pkg}'` : null;
  },
  'pip list': () => 'listing installed Python packages',
  'pip freeze': () => 'listing installed packages in requirements.txt format',
  'pip3 install': (args, flags) => {
    const isUpgrade = flags.includes('-U') || flags.includes('--upgrade');
    const isReq = flags.includes('-r');
    const packages = args.filter(a => !a.startsWith('-'));
    if (isReq && packages[0]) return `installing packages from '${packages[0]}'`;
    if (!packages.length) return null;
    const verb = isUpgrade ? 'upgrading' : 'installing';
    return packages.length === 1 ? `${verb} '${packages[0]}'` : `${verb} ${packages.length} packages`;
  },
  'pip3 uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `uninstalling '${pkg}'` : null;
  },

  // --- Package managers: apt ---
  'apt install': (args) => {
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    return pkgs.length === 1 ? `installing '${pkgs[0]}'` : `installing ${pkgs.length} packages`;
  },
  'apt remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removing '${pkg}'` : null;
  },
  'apt update': () => 'refreshing package index from repositories',
  'apt upgrade': () => 'upgrading all installed packages to latest versions',
  'apt-get install': (args) => {
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    return pkgs.length === 1 ? `installing '${pkgs[0]}'` : `installing ${pkgs.length} packages`;
  },
  'apt-get remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removing '${pkg}'` : null;
  },
  'apt-get update': () => 'refreshing package index',
  'apt-get upgrade': () => 'upgrading installed packages',

  // --- yarn ---
  'yarn add': (args, flags) => {
    const isDev = flags.includes('--dev') || flags.includes('-D');
    const pkgs = args.filter(a => !a.startsWith('-'));
    if (!pkgs.length) return null;
    const scope = isDev ? 'as dev dependency: ' : '';
    return pkgs.length === 1 ? `adding ${scope}'${pkgs[0]}'` : `adding ${scope}${pkgs.length} packages`;
  },
  'yarn remove': (args) => {
    const pkg = args.find(a => !a.startsWith('-'));
    return pkg ? `removing '${pkg}'` : null;
  },
  'yarn install': () => 'installing all dependencies from yarn.lock',
  'yarn run': (args, flags, subcommand) => {
    const script = subcommand ?? args[0];
    return script ? `running yarn script '${script}'` : null;
  },
  'yarn build': () => 'building the project',
  'yarn test': () => 'running the test suite',

  // --- cargo ---
  'cargo build': (args, flags) => {
    const isRelease = flags.includes('--release');
    return isRelease ? 'building in release mode (optimized)' : 'building in debug mode';
  },
  'cargo run': (args, flags) => {
    const isRelease = flags.includes('--release');
    return `running the binary${isRelease ? ' (release build)' : ''}`;
  },
  'cargo test': (args) => {
    const test = args[0];
    return test ? `running tests matching '${test}'` : 'running all tests';
  },
  'cargo add': (args) => {
    const pkg = args[0];
    return pkg ? `adding '${pkg}' as a dependency` : null;
  },
  'cargo new': (args, flags) => {
    const name = args.find(a => !a.startsWith('-'));
    const isLib = flags.includes('--lib');
    return name ? `creating new ${isLib ? 'library' : 'binary'} project '${name}'` : null;
  },
  'cargo check': () => 'checking for errors (no binary produced)',
  'cargo clippy': () => 'running the Clippy linter',
  'cargo fmt': () => 'formatting all Rust source files',

  // --- Docker ---
  'docker build': (args) => {
    const tag = args.find(a => !a.startsWith('-') && a !== '.');
    return tag ? `building image tagged '${tag}'` : 'building Docker image';
  },
  'docker exec': (args) => {
    const container = args.find(a => !a.startsWith('-'));
    return container ? `executing command in container '${container}'` : null;
  },
  'docker images': () => 'listing all local Docker images',
  'docker logs': (args, flags) => {
    const isFollow = flags.includes('-f') || flags.includes('--follow');
    const container = args.find(a => !a.startsWith('-'));
    if (isFollow && container) return `streaming logs from '${container}'`;
    if (container) return `showing logs from '${container}'`;
    return null;
  },
  'docker ps': (args, flags) => {
    const isAll = flags.includes('-a') || flags.includes('--all');
    return isAll ? 'listing all containers (including stopped)' : 'listing running containers';
  },
  'docker pull': (args) => {
    const image = args.find(a => !a.startsWith('-'));
    return image ? `pulling image '${image}' from registry` : null;
  },
  'docker push': (args) => {
    const image = args.find(a => !a.startsWith('-'));
    return image ? `pushing image '${image}' to registry` : null;
  },
  'docker rm': (args) => {
    const containers = args.filter(a => !a.startsWith('-'));
    if (containers.length === 1) return `removing container '${containers[0]}'`;
    if (containers.length > 1) return `removing ${containers.length} containers`;
    return null;
  },
  'docker run': (args) => {
    const image = args.filter(a => !a.startsWith('-')).pop();
    return image ? `starting container from image '${image}'` : null;
  },
  'docker stop': (args) => {
    const container = args.find(a => !a.startsWith('-'));
    return container ? `stopping container '${container}'` : null;
  },
};

export function getArgumentContext(command, subcommand, args, flags = []) {
  const key = subcommand ? `${command} ${subcommand}` : command;
  const handler = HANDLERS[key] ?? HANDLERS[command];
  // Pass subcommand as third arg so handlers like xargs, sudo, npx can use it
  return handler ? handler(args, flags, subcommand) : null;
}
