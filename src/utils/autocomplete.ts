import { AutocompleteInteraction } from "discord.js";
import { getDb } from "../db/index.js";

export async function characterAutocomplete(interaction: AutocompleteInteraction, userField?: string) {
  
  const focusedOption = interaction.options.getFocused(true);
  const focused = focusedOption.value ?? "";

  let userId: string;

  if (!userField) {
    const match = focusedOption.name.match(/^char(\d+)$/);
    if (match) {
      const index = match[1];
      userField = `user${index}`;
    } else {
      userField = "user";
    }
  }

  const rawUserOpt = interaction.options.get(userField);
  const resolvedUserId = (rawUserOpt?.value as string) || interaction.user.id;

  const db = getDb();

  const query = `
    SELECT name
    FROM charlog
    WHERE userId = ?
      AND LOWER(name) LIKE LOWER(?)
    ORDER BY name ASC
    LIMIT 25
  `;
  const match = `%${focused}%`;
  let rows = await db.all(query, [resolvedUserId, match]);
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];

  const choices = rows.map((r: any) => ({
    name: r.name,
    value: r.name,
  }));

  await interaction.respond(choices);
}