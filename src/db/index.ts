import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { time } from 'console';
import { date } from 'zod';

export type Sqlite = Database<sqlite3.Database, sqlite3.Statement>;
let _db: Sqlite | null = null;

const DEFAULT_DB = process.env.DB_FILE || path.resolve(process.cwd(), 'data/remnant.sqlite');
const FUND_ID = process.env.GUILD_FUND_ID || 'sys:fund:remnant';

export async function initDb(dbFile = DEFAULT_DB) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = await open({ filename: dbFile, driver: sqlite3.Database });

  // Character log database (table + pragmas)
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA wal_autocheckpoint = 1000;

    CREATE TABLE IF NOT EXISTS charlog (
      userId TEXT,
      name   TEXT NOT NULL,
      level  INTEGER NOT NULL,
      xp     INTEGER NOT NULL,
      cp     INTEGER NOT NULL,
      tp     INTEGER NOT NULL,
      active BOOL NOT NULL,
      PRIMARY KEY (userId, name)
    );
  `);

  
  // LFG presence tracking (table + index) [deprecated]
  // await db.exec(`
  //   CREATE TABLE IF NOT EXISTS lfg_presence (
  //     userId  TEXT NOT NULL,
  //     guildId TEXT NOT NULL,
  //     tier    TEXT NOT NULL CHECK (tier IN ('low','mid','high','epic','pbp')),
  //     since   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  //     PRIMARY KEY (userId, tier),
  //     FOREIGN KEY (userId) REFERENCES charlog(userId) ON DELETE CASCADE
  //   );
  //   CREATE INDEX IF NOT EXISTS idx_lfg_guild_tier ON lfg_presence (guildId, tier, since);
  // `);
  // drop above table since we've got a better LFG table and make sure indexes are gone
  await db.exec(`DROP TABLE IF EXISTS lfg_presence; DROP INDEX IF EXISTS idx_lfg_guild_tier;`);


  // New LFG status table + guild state table
  await db.exec(`
    -- LFG registry
    CREATE TABLE IF NOT EXISTS lfg_status (
      userId    TEXT PRIMARY KEY,
      guildId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      startedAt INTEGER NOT NULL,  -- ms since epoch
      low       INTEGER NOT NULL DEFAULT 0,
      mid       INTEGER NOT NULL DEFAULT 0,
      high      INTEGER NOT NULL DEFAULT 0,
      epic      INTEGER NOT NULL DEFAULT 0,
      pbp       INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );

    -- sticky board message id (and other guild-scoped flags)
    CREATE TABLE IF NOT EXISTS guild_state (
      guildId TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (guildId, key)
    );

      `)

  
  // create the fund row if missing
  await db.run(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
     VALUES (?, 'Adventurers Guild Fund', 20, 305000, 500000, 0, true)
     ON CONFLICT(userId,name) DO NOTHING`,
    FUND_ID
  );


  _db = db;
    console.log(`📂 Database initialized: ${dbFile}`);
  return db;
}

export async function migrateDb(dbFile = DEFAULT_DB) {
  const db = await open({ filename: dbFile, driver: sqlite3.Database });

  // add COLUMN active to charlog
  const migrate_check1 = await db.get(`SELECT * FROM pragma_table_info('charlog') WHERE name = 'active';`);
  if (!migrate_check1) {await db.exec(`
    ALTER TABLE charlog
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1;
  `);}
  // add COLUMN dtp to charlog
  const migrate_check2 = await db.get(`SELECT * FROM pragma_table_info('charlog') WHERE name = 'dtp';`);
  if (!migrate_check2) {await db.exec(`
    ALTER TABLE charlog
    ADD COLUMN dtp INTEGER NOT NULL DEFAULT 0;
  `);}
  // add COLUMN dtp_updated to charlog
  const migrate_check3 = await db.get(`SELECT * FROM pragma_table_info('charlog') WHERE name = 'dtp_updated';`);
  const timestamp = new Date().getTime() / 1000
  const timestampNormal = timestamp - (timestamp % 86400)
  if (!migrate_check3) {await db.exec(`
    ALTER TABLE charlog
    ADD COLUMN dtp_updated INTEGER NOT NULL DEFAULT ${ timestampNormal };
  `);}
  // add library table
  const migrate_check4 = await db.get(`SELECT * FROM pragma_table_info('library') WHERE name = 'title';`);
  if (!migrate_check4) {await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA wal_autocheckpoint = 1000;

    CREATE TABLE IF NOT EXISTS library (
      title TEXT,
      genre   TEXT NOT NULL,
      content  TEXT NOT NULL,
      PRIMARY KEY (title)
    );
  `);}
  // add COLUMN cc to charlog
  const migrate_check5 = await db.get(`SELECT * FROM pragma_table_info('charlog') WHERE name = 'cc';`);
  if (!migrate_check5) {await db.exec(`
    ALTER TABLE charlog
    ADD COLUMN cc INTEGER NOT NULL DEFAULT 0;
  `);}

  console.log(`📂 Database migrations done: ${dbFile}`);
  return db;
}

export function getDb(): Sqlite {
  if (!_db) throw new Error('DB not initialized — call initDb() before using getDb()');
  return _db;
}