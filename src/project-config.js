import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getMutelist, getBlocklist, getBlockPatterns } from './config.js';
import { getProfile } from './profiles.js';

// Walk up from startDir looking for .wtflag.json
export function findProjectConfig(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, '.wtflag.json');
    if (existsSync(candidate)) {
      try { return { path: candidate, config: JSON.parse(readFileSync(candidate, 'utf8')) }; }
      catch { return null; }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Returns the merged config that hook.js uses at runtime.
// Precedence: global base + optional profile + project overrides.
export function getEffectiveConfig(cwd = process.cwd()) {
  // Start from global config
  const mutelist = new Set(getMutelist());
  const blocklist = new Set(getBlocklist());
  const blockPatterns = [...getBlockPatterns()];

  // Overlay project config if found
  const found = findProjectConfig(cwd);
  if (found) {
    const proj = found.config;

    // Optionally inherit a named profile as the project base
    if (proj.profile) {
      const profile = getProfile(proj.profile);
      if (profile) {
        (profile.muted ?? []).forEach(c => mutelist.add(c.toLowerCase()));
        (profile.blocked ?? []).forEach(c => blocklist.add(c.toLowerCase()));
        (profile.blockPatterns ?? []).forEach(p => { if (!blockPatterns.includes(p)) blockPatterns.push(p); });
      }
    }

    (proj.muted ?? []).forEach(c => mutelist.add(c.toLowerCase()));
    (proj.blocked ?? []).forEach(c => blocklist.add(c.toLowerCase()));
    (proj.blockPatterns ?? []).forEach(p => { if (!blockPatterns.includes(p)) blockPatterns.push(p); });
  }

  return { mutelist, blocklist, blockPatterns };
}
