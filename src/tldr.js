import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'db', 'tldr.db');

let db = null;

function getDb() {
  if (db) return db;
  if (!existsSync(DB_PATH)) return null;
  db = new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

// Returns the compound entry (git-commit) without falling back to the base command
export function lookupCompound(command, subcommand) {
  const database = getDb();
  if (!database) return null;
  return database.prepare(
    'SELECT description, content FROM commands WHERE name = ? OR name = ? LIMIT 1'
  ).get(`${command}-${subcommand}`, `${command} ${subcommand}`) ?? null;
}

export function lookupCommand(command, subcommand = null) {
  const database = getDb();
  if (!database) return null;

  if (subcommand) {
    const stmt = database.prepare(
      'SELECT description, content FROM commands WHERE name = ? OR name = ? LIMIT 1'
    );
    const compound = stmt.get(`${command}-${subcommand}`, `${command} ${subcommand}`);
    if (compound) return compound;
  }

  return database.prepare(
    'SELECT description, content FROM commands WHERE name = ? LIMIT 1'
  ).get(command) ?? null;
}

export function dbExists() {
  return existsSync(DB_PATH);
}
