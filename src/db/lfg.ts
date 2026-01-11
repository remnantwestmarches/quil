// src/db/lfg.ts
import { getDb } from "../db/index.js";
import type { LfgEntry } from "../domain/lfg.js";

export async function getLfgEntry(userId: string): Promise<LfgEntry | null> {
  const db = await getDb();
  const row = await db.get<LfgEntry>(`SELECT * FROM lfg_status WHERE userId = ?`, userId);
  return row ?? null;
}

export async function upsertLfgEntry(e: LfgEntry) {
  const db = await getDb();
  await db.run(
    `INSERT INTO lfg_status (userId, guildId, name, startedAt, low, mid, high, epic, pbp, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       guildId = excluded.guildId,
       name = excluded.name,
       startedAt = excluded.startedAt,
       low = excluded.low, mid = excluded.mid, high = excluded.high, epic = excluded.epic, pbp = excluded.pbp,
       updatedAt = excluded.updatedAt`,
    [e.userId, e.guildId, e.name, e.startedAt, e.low, e.mid, e.high, e.epic, e.pbp, e.updatedAt]
  );
}

export async function deleteLfgEntry(userId: string) {
  const db = await getDb();
  await db.run(`DELETE FROM lfg_status WHERE userId = ?`, userId);
}

export async function listAllLfg(guildId: string): Promise<LfgEntry[]> {
  const db = await getDb();
  const rows = await db.all<LfgEntry[]>(
    `SELECT * FROM lfg_status WHERE guildId = ?`,
    guildId
  );
  return rows ?? [];
}

export async function purgeLfgBefore(guildId: string, olderThanMs: number, scope: "all" | "pbp"): Promise<string[]> {
  const db = await getDb();
  const clause = scope === "pbp"
    ? `AND pbp = 1`
    : `AND (low = 1 OR mid = 1 OR high = 1 OR epic = 1)`;
  const rows = await db.all<{ userId: string }[]>(
    `SELECT userId FROM lfg_status WHERE guildId = ? AND startedAt < ? ${clause}`,
    guildId, olderThanMs
  );
  const ids = rows?.map(r => r.userId) ?? [];
  if (ids.length) {
    const qmarks = ids.map(() => "?").join(",");
    await db.run(`DELETE FROM lfg_status WHERE userId IN (${qmarks})`, ids);
  }
  return ids;
}
