// Test database utilities
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import type { Sqlite } from '../../src/db/index.js';

let testDbCounter = 0;

export async function createTestDb(): Promise<Sqlite> {
  // Use in-memory database for tests
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  // Initialize schema (copied from src/db/index.ts initDb)
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
      dtp    INTEGER NOT NULL DEFAULT 0,
      dtp_updated INTEGER NOT NULL DEFAULT 0,
      cc     INTEGER NOT NULL DEFAULT 0,
      active BOOL NOT NULL,
      PRIMARY KEY (userId, name)
    );

    CREATE TABLE IF NOT EXISTS lfg_status (
      userId    TEXT PRIMARY KEY,
      guildId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      low       INTEGER NOT NULL DEFAULT 0,
      mid       INTEGER NOT NULL DEFAULT 0,
      high      INTEGER NOT NULL DEFAULT 0,
      epic      INTEGER NOT NULL DEFAULT 0,
      pbp       INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_state (
      guildId TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (guildId, key)
    );

    CREATE TABLE IF NOT EXISTS library (
      title TEXT,
      genre   TEXT NOT NULL,
      content  TEXT NOT NULL,
      PRIMARY KEY (title)
    );
  `);

  return db;
}

export async function seedTestPlayer(db: Sqlite, data: {
  userId: string;
  name: string;
  level?: number;
  xp?: number;
  cp?: number;
  tp?: number;
  dtp?: number;
  cc?: number;
  active?: boolean;
}) {
  await db.run(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, dtp, cc, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.userId,
    data.name,
    data.level ?? 1,
    data.xp ?? 0,
    data.cp ?? 0,
    data.tp ?? 0,
    data.dtp ?? 0,
    data.cc ?? 0,
    data.active ? 1 : 0
  );
}

export async function cleanupTestDb(db: Sqlite) {
  await db.close();
}
