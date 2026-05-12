import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DATA_DIR } from '../src/platform.js';

// adm-zip has no named ESM exports, so require() is the only way to load it in an ES module
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DB_DIR = join(__dirname, '..', 'db');
const ZIP_URL = 'https://github.com/tldr-pages/tldr/releases/latest/download/tldr.zip';

// Prefer the package-local db/ dir (local installs).
// Fall back to DATA_DIR if package dir is not writable (global installs).
function resolveDbDir() {
  try {
    if (!existsSync(PACKAGE_DB_DIR)) mkdirSync(PACKAGE_DB_DIR, { recursive: true });
    const probe = join(PACKAGE_DB_DIR, '.write-check');
    writeFileSync(probe, '');
    unlinkSync(probe);
    return PACKAGE_DB_DIR;
  } catch {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    return DATA_DIR;
  }
}

export async function buildDb() {
  console.log('Downloading tldr-pages...');

  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Failed to download tldr-pages: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  console.log('Extracting and building database...');

  const dbDir = resolveDbDir();
  const dbPath = join(dbDir, 'tldr.db');
  const tmpPath = dbPath + '.tmp';

  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  if (existsSync(tmpPath)) unlinkSync(tmpPath);
  const db = new DatabaseSync(tmpPath);

  db.exec(`
    CREATE TABLE commands (
      name        TEXT PRIMARY KEY,
      platform    TEXT,
      description TEXT,
      content     TEXT
    );
    CREATE INDEX idx_name ON commands(name);
  `);

  const insert = db.prepare(
    'INSERT OR REPLACE INTO commands (name, platform, description, content) VALUES (?, ?, ?, ?)'
  );

  let count = 0;
  for (const entry of entries) {
    // Only process base English pages, skip localized pages.zh/, pages.de/, etc.
    const match = entry.entryName.match(/^pages\/(\w+)\/(.+)\.md$/);
    if (!match) continue;

    const [, platform, name] = match;
    const content = entry.getData().toString('utf8');
    const description = extractDescription(content);

    insert.run(name, platform, description, content);
    count++;
  }

  db.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  renameSync(tmpPath, dbPath);
  console.log(`✓ Database built with ${count} commands → ${dbPath}`);
}

function extractDescription(markdown) {
  const lines = markdown.split('\n');
  const descLines = [];
  for (const line of lines) {
    if (line.startsWith('> ') && !line.includes('http')) {
      descLines.push(line.slice(2).replace(/\.$/, ''));
    }
    if (descLines.length && !line.startsWith('>')) break;
  }
  return descLines.join(' ') || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDb().catch(err => { console.error(err.message); process.exit(1); });
}
