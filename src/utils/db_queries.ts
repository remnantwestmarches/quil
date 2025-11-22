import { getDb } from "../db/index.js";

type PlayerRow = {
  userId: string;
  name: string;
  xp: number;
  level: number;
  cp: number;
  tp: number;
  dtp: number;
  dtp_updated: number;
  active: boolean;
};

export async function getPlayer(
  userId: string,
  name?: string
): Promise<PlayerRow | null> {
  const db = getDb();

  // Base query
  let query = `
    SELECT userId, name, xp, level, cp, tp, dtp, dtp_updated, active
    FROM charlog
    WHERE userId = ?
  `;

  const params: (string | number)[] = [userId];

  if (name && name.trim() !== "") {
    query += ` AND name = ?`;
    params.push(name);
  } else {
    query += ` AND active = 1`;
  }

  const row = await db.get<PlayerRow>(query, params);
  return row ?? null;
}

export async function adjustResource(userId: string, columns: string[], values: number[], set: boolean = false, name: string = "") {
  const db = getDb();
  
  const allowed = ["xp", "level", "cp", "tp", "dtp", "dtp_updated"];

  for (const col of columns) {
    if (!allowed.includes(col)) {
      throw new Error(`Invalid resource column: ${col}`);
    }
  }
  
  const assignments = columns.map(col =>
    set ? `${col} = ?` : `${col} = ${col} + ?`
  );

  let query = `
    UPDATE charlog
    SET ${assignments.join(", ")}
    WHERE userId = ?
    ${name.trim() !== "" ? "AND name = ?" : "AND active = 1"}
  `;

  const params: (string | number)[] = [...values, userId];
  if (name.trim() !== "") params.push(name);

  await db.run(query,params);
}