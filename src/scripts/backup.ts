import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const DB_FILE = process.env.DB_FILE || './data/remnant.sqlite';
const BACKUP_DIR = process.env.BACKUP_DIR || '../bissel-modern-backup/backups';
const RETAIN_DAYS = Number(process.env.BACKUP_RETAIN_DAYS ?? 14);

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });

  // Destination file (uncompressed .sqlite snapshot)
  const dest = path.resolve(BACKUP_DIR, `remnant-${stamp()}.sqlite`);
  const escaped = dest.replace(/'/g, "''"); // escape single quotes for SQL

  // Create a consistent snapshot
  await db.exec(`PRAGMA wal_checkpoint(FULL);`);
  await db.exec(`VACUUM INTO '${escaped}';`);
  await db.close();

  console.log(`[backup] wrote ${dest}`);

  // Retention cleanup
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => path.join(BACKUP_DIR, f));

  for (const f of files) {
    const s = fs.statSync(f);
    if (s.mtime.getTime() < cutoff) {
      fs.unlinkSync(f);
      console.log(`[backup] pruned ${f}`);
    }
  }
}

main().catch(err => { console.error('[backup] failed:', err); process.exit(1); });
