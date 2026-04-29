const HANDLERS = {
  // --- git ---
  'git push': (args) => {
    const [remote, branch] = args;
    if (remote && branch) return `pushing local '${branch}' to remote '${remote}'`;
    if (remote) return `pushing to remote '${remote}'`;
    return null;
  },
  'git pull': (args) => {
    const [remote, branch] = args;
    if (remote && branch) return `pulling '${branch}' from '${remote}'`;
    if (remote) return `pulling from '${remote}'`;
    return null;
  },
  'git checkout': (args, flags) => {
    const target = args[0];
    if (!target) return null;
    const isNew = flags.includes('-b') || flags.includes('-B');
    return isNew ? `creating and switching to branch '${target}'` : `switching to '${target}'`;
  },
  'git merge': (args) => {
    const branch = args[0];
    return branch ? `merging '${branch}' into current branch` : null;
  },
  'git branch': (args, flags) => {
    const name = args[0];
    const isDelete = flags.some(f => ['-d', '-D', '--delete'].includes(f));
    if (isDelete && name) return `deleting branch '${name}'`;
    if (name) return `creating branch '${name}'`;
    return 'listing local branches';
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
  'git rebase': (args, flags) => {
    const target = args[0];
    const isInteractive = flags.includes('-i') || flags.includes('--interactive');
    if (target && isInteractive) return `interactively rebasing onto '${target}'`;
    if (target) return `rebasing current branch onto '${target}'`;
    return null;
  },
  'git clone': (args) => {
    const [url, dest] = args;
    if (url && dest) return `cloning '${url}' into '${dest}'`;
    if (url) return `cloning from '${url}'`;
    return null;
  },
  'git add': (args, flags) => {
    const isAll = flags.includes('-A') || flags.includes('--all') || args.includes('.');
    if (isAll || args[0] === '.') return 'staging all changes';
    if (args.length === 1) return `staging '${args[0]}'`;
    if (args.length > 1) return `staging ${args.length} files`;
    return null;
  },
  'git log': (args, flags) => {
    const n = flags.find(f => /^-\d+$/.test(f));
    if (n) return `showing last ${n.slice(1)} commits`;
    if (args[0]) return `showing log for '${args[0]}'`;
    return null;
  },
  'git diff': (args) => {
    if (!args.length) return 'showing unstaged changes';
    if (args[0] === '--staged' || args[0] === '--cached') return 'showing staged changes';
    if (args.length === 1) return `diffing against '${args[0]}'`;
    return null;
  },
  // --- File ops ---
  'cp': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    if (pos.length < 2) return null;
    const dest = pos[pos.length - 1];
    const srcs = pos.slice(0, -1);
    return srcs.length === 1
      ? `copying '${srcs[0]}' to '${dest}'`
      : `copying ${srcs.length} items to '${dest}'`;
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
  'mkdir': (args) => {
    const dir = args.find(a => !a.startsWith('-'));
    return dir ? `creating directory '${dir}'` : null;
  },
  'cd': (args) => {
    const dir = args[0];
    return dir ? `changing to '${dir}'` : 'changing to home directory';
  },
  'cat': (args) => {
    const files = args.filter(a => !a.startsWith('-'));
    if (files.length === 1) return `reading '${files[0]}'`;
    if (files.length > 1) return `reading and concatenating ${files.length} files`;
    return null;
  },
  'ls': (args) => {
    const dirs = args.filter(a => !a.startsWith('-'));
    if (dirs.length === 1) return `listing contents of '${dirs[0]}'`;
    if (dirs.length > 1) return `listing ${dirs.length} directories`;
    return null;
  },
  'touch': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `creating or updating timestamp of '${file}'` : null;
  },
  'chmod': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [mode, ...targets] = pos;
    if (!mode || !targets.length) return null;
    const extra = targets.length > 1 ? ` (+${targets.length - 1} more)` : '';
    return `setting permissions '${mode}' on '${targets[0]}'${extra}`;
  },
  'chown': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [owner, target] = pos;
    return owner && target ? `changing owner to '${owner}' on '${target}'` : null;
  },
  // --- Search ---
  'grep': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    const [pattern, ...files] = pos;
    if (!pattern) return null;
    if (files.length === 1) return `searching for '${pattern}' in '${files[0]}'`;
    if (files.length > 1) return `searching for '${pattern}' across ${files.length} files`;
    return `searching for '${pattern}'`;
  },
  'find': (args) => {
    const dir = args.find(a => !a.startsWith('-'));
    const nameIdx = args.indexOf('-name');
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : null;
    if (dir && pattern) return `searching in '${dir}' for files matching '${pattern}'`;
    if (dir) return `searching in '${dir}'`;
    return null;
  },
  // --- Network ---
  'curl': (args) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    return url ? `fetching '${url}'` : null;
  },
  'wget': (args) => {
    const url = args.find(a => !a.startsWith('-') && a.includes('://'));
    return url ? `downloading '${url}'` : null;
  },
  'ssh': (args) => {
    const target = args.find(a => !a.startsWith('-'));
    return target ? `connecting to '${target}'` : null;
  },
  'scp': (args) => {
    const pos = args.filter(a => !a.startsWith('-'));
    return pos.length >= 2 ? `copying '${pos[0]}' to '${pos[1]}'` : null;
  },
  // --- Node / npm ---
  'node': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `running '${file}'` : null;
  },
  'npm install': (args) => {
    const packages = args.filter(a => !a.startsWith('-'));
    if (!packages.length) return 'installing all dependencies from package.json';
    if (packages.length === 1) return `installing '${packages[0]}'`;
    return `installing ${packages.length} packages`;
  },
  'npm run': (args) => {
    const script = args[0];
    return script ? `running npm script '${script}'` : null;
  },
  'npm uninstall': (args) => {
    const pkg = args[0];
    return pkg ? `removing '${pkg}'` : null;
  },
  // --- Python ---
  'python': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `running '${file}'` : null;
  },
  'python3': (args) => {
    const file = args.find(a => !a.startsWith('-'));
    return file ? `running '${file}'` : null;
  },
  // --- Docker ---
  'docker run': (args) => {
    const image = args.filter(a => !a.startsWith('-')).pop();
    return image ? `starting container from image '${image}'` : null;
  },
  'docker build': (args) => {
    // After -t flag is tokenized out, the tag value lands in args
    const tag = args.find(a => !a.startsWith('-') && a !== '.');
    return tag ? `building image tagged '${tag}'` : 'building Docker image';
  },
  'docker exec': (args) => {
    const container = args.find(a => !a.startsWith('-'));
    return container ? `executing command in container '${container}'` : null;
  },
  'docker stop': (args) => {
    const container = args.find(a => !a.startsWith('-'));
    return container ? `stopping container '${container}'` : null;
  },
  'docker rm': (args) => {
    const containers = args.filter(a => !a.startsWith('-'));
    if (containers.length === 1) return `removing container '${containers[0]}'`;
    if (containers.length > 1) return `removing ${containers.length} containers`;
    return null;
  },
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
};

export function getArgumentContext(command, subcommand, args, flags = []) {
  const key = subcommand ? `${command} ${subcommand}` : command;
  const handler = HANDLERS[key] ?? HANDLERS[command];
  return handler ? handler(args, flags) : null;
}
