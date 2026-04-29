import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'db', 'tldr.db');

let db = null;

function getDb() {
  if (db) return db;
  if (!existsSync(DB_PATH)) return null;
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH, { readonly: true });
  return db;
}

export function lookupCommand(command, subcommand = null) {
  const database = getDb();
  if (!database) return null;

  // Try compound name first: git-commit, npm-install, etc.
  if (subcommand) {
    const compound = database.prepare(
      'SELECT description, content FROM commands WHERE name = ? OR name = ? LIMIT 1'
    ).get(`${command}-${subcommand}`, `${command} ${subcommand}`);
    if (compound) return compound;
  }

  return database.prepare(
    'SELECT description, content FROM commands WHERE name = ? LIMIT 1'
  ).get(command) ?? null;
}

export function dbExists() {
  return existsSync(DB_PATH);
}
