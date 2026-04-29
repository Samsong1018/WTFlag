import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'db');
const DB_PATH = join(DB_DIR, 'tldr.db');
const ZIP_URL = 'https://github.com/tldr-pages/tldr/releases/latest/download/tldr.zip';

export async function buildDb() {
  console.log('Downloading tldr-pages...');

  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

  // Download zip
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Failed to download tldr-pages: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  console.log('Extracting and building database...');

  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const Database = require('better-sqlite3');
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE commands (
      name     TEXT PRIMARY KEY,
      platform TEXT,
      description TEXT,
      content  TEXT
    );
    CREATE INDEX idx_name ON commands(name);
  `);

  const insert = db.prepare(
    'INSERT OR REPLACE INTO commands (name, platform, description, content) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row.name, row.platform, row.description, row.content);
  });

  const rows = [];

  for (const entry of entries) {
    const path = entry.entryName;
    // Match: pages/common/git-commit.md or pages.en/linux/apt.md
    const match = path.match(/^pages(?:\.\w+)?\/(\w+)\/(.+)\.md$/);
    if (!match) continue;

    const [, platform, name] = match;
    const content = entry.getData().toString('utf8');
    const description = extractDescription(content);

    rows.push({ name, platform, description, content });
  }

  insertMany(rows);
  db.close();

  console.log(`✓ Database built with ${rows.length} commands → ${DB_PATH}`);
}

function extractDescription(markdown) {
  const lines = markdown.split('\n');
  const descLines = [];
  for (const line of lines) {
    if (line.startsWith('> ') && !line.includes('http')) {
      descLines.push(line.slice(2).replace(/\.$/, ''));
    }
    // Stop collecting after the description block
    if (descLines.length && !line.startsWith('>')) break;
  }
  return descLines.join(' ') || null;
}

// Allow running directly: node scripts/build-db.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDb().catch(err => { console.error(err.message); process.exit(1); });
}
