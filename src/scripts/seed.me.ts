import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const DB_FILE = process.env.DB_FILE || './data/remnant.sqlite';
const MY_ID = process.env.MY_DISCORD_ID || '246030816692404234';

async function main() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });

  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS charlog (
      userId TEXT,
      name   TEXT NOT NULL,
      level  INTEGER NOT NULL,
      xp     INTEGER NOT NULL,
      cp     INTEGER NOT NULL,  -- copper (GP*100)
      tp     INTEGER NOT NULL   -- halves of TP (TP*2)
      active BOOL NOT NULL,
      PRIMARY KEY (userId, name)
    );
  `);

  // minimal seed: you + (optional) guild fund
  await db.run(`
    INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      name=excluded.name, level=excluded.level, xp=excluded.xp,
      cp=excluded.cp, tp=excluded.tp
  `, [MY_ID, 'Donovan Test', 3, 900, 12500, 4, true]); // 125.00 GP, 2.0 TP


  const row = await db.get(`SELECT name, level, xp, cp, tp FROM charlog WHERE userId=? AND active = 1`, MY_ID);
  console.log('Seeded:', row);
  await db.close();
  console.log('🌱 Seed complete →', DB_FILE);
}

main().catch(err => { console.error(err); process.exit(1); });
