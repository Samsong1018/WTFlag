import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DATA_DIR } from './platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DB_PATH = join(__dirname, '..', 'db', 'tldr.db');
const USER_DB_PATH = join(DATA_DIR, 'tldr.db');

function resolveDbPath() {
  if (existsSync(PACKAGE_DB_PATH)) return PACKAGE_DB_PATH;
  if (existsSync(USER_DB_PATH)) return USER_DB_PATH;
  return PACKAGE_DB_PATH;
}

let db = null;
let stmtCompound = null;
let stmtSingle = null;
let stmtBase = null;

function getDb() {
  if (db) return db;
  const path = resolveDbPath();
  if (!existsSync(path)) return null;
  db = new DatabaseSync(path, { readOnly: true });
  stmtCompound = db.prepare('SELECT description, content FROM commands WHERE name = ? OR name = ? LIMIT 1');
  stmtSingle   = db.prepare('SELECT description, content FROM commands WHERE name = ? OR name = ? LIMIT 1');
  stmtBase     = db.prepare('SELECT description, content FROM commands WHERE name = ? LIMIT 1');
  return db;
}

// Returns the compound entry (git-commit) without falling back to the base command
export function lookupCompound(command, subcommand) {
  if (!getDb()) return null;
  return stmtCompound.get(`${command}-${subcommand}`, `${command} ${subcommand}`) ?? null;
}

export function lookupCommand(command, subcommand = null) {
  if (!getDb()) return null;

  if (subcommand) {
    const compound = stmtSingle.get(`${command}-${subcommand}`, `${command} ${subcommand}`);
    if (compound) return compound;
  }

  return stmtBase.get(command) ?? null;
}

export function dbExists() {
  return existsSync(PACKAGE_DB_PATH) || existsSync(USER_DB_PATH);
}
