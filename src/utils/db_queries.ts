import type { SheetStory } from "../commands/library.js";
import { getDb } from "../db/index.js";

export type PlayerRow = {
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

export const StoryCache = {
  stories: [] as SheetStory[],
  genres: [] as string[],
  titlesByGenre: new Map<string, string[]>(),
  allTitles: [] as string[],
};

export const CharCache = {
  charsByUser: new Map<string, string[]>(),
}

export async function getPlayer(userId: string, name?: string,): Promise<PlayerRow | undefined> {
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
  return row;
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

  const query = `
    UPDATE charlog
    SET ${assignments.join(", ")}
    WHERE userId = ?
    ${name.trim() !== "" ? "AND name = ?" : "AND active = 1"}
  `;

  const params: (string | number)[] = [...values, userId];
  if (name.trim() !== "") params.push(name);
  await db.run(query,params);
  return await getPlayer(userId, name)
}

export async function setActive(userId: string, name: string){
  const db = getDb();

  if (await getPlayer(userId, name)){
    await db.run(
      `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
      userId,
      name
    );

    return await db.get(
      `UPDATE charlog SET active = 1 WHERE userId = ? AND name = ?`,
      userId,
      name
    );
  }
}

export async function loadStoryCacheFromDB() {
  const db = getDb();
  const rows = await db.all<SheetStory[]>(`SELECT * FROM library`);

  StoryCache.stories = rows;

  // Unique genres
  const genres = new Set<string>();
  const titlesByGenre = new Map<string, string[]>();
  const allTitles: string[] = [];

  for (const story of rows) {
    genres.add(story.genre);
    allTitles.push(story.title);

    if (!titlesByGenre.has(story.genre)) {
      titlesByGenre.set(story.genre, []);
    }
    titlesByGenre.get(story.genre)!.push(story.title);
  }

  StoryCache.genres = Array.from(genres).sort();
  StoryCache.titlesByGenre = titlesByGenre;
  StoryCache.allTitles = allTitles.sort();

}

export async function loadCharCacheFromDB() {
  const db = getDb();
  const rows = await db.all<PlayerRow[]>(`SELECT * FROM charlog`);

  // Unique genres
  
  const charsByUser = new Map<string, string[]>();
  

  for (const player of rows) {
    if (!charsByUser.has(player.userId)) {
      charsByUser.set(player.userId, []);
    }
    charsByUser.get(player.userId)!.push(player.name);
  }

  CharCache.charsByUser = charsByUser;
}