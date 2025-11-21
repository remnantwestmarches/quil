// commands/charinfo.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { getDb } from "../db/index.js";
import { t } from "../lib/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("charinfo")
  .setDescription("Show your character info (or mention a user)")
  .addUserOption((o) => o.setName("user").setDescription("Target user"))
  .addStringOption((o) => o.setName("character").setDescription("Target character"));


export async function execute(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user") ?? interaction.user;
  const char = interaction.options.getString("character") ?? null;
  const caller = interaction.user;
  const db = getDb();
  let query = `SELECT name, level, xp, tp, cp FROM charlog WHERE userId = ${user.id}`
  if (char) { query += ` AND name = '${char}'` }
  else { query += " AND active = true" }
  const row = await db.get(query);
  if (!row) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: t('common.noActiveChar', { user: user.toString() }),
    });
    return;
  }
  const gp = (row.cp / 100).toFixed(2);
  const tp = (row.tp).toFixed(1);
 
// Reply with embed
  await interaction.reply({embeds: [
      new EmbedBuilder()
        .setColor(0x0099ff) // set to brand color
        .setThumbnail(user.displayAvatarURL())
        .setTitle(`Character — ${row.name}`)
        .setDescription("OOC Owner: " + user.toString())
        .addFields(
          { name: 'Level', value: "⭐ " + String(row.level), inline: true },
          { name: 'Experience (XP)', value:"💪 " + String(row.xp), inline: true })
          .addFields(
            { name: 'Golden Tickets (GT)', value: "🎫 " + tp, inline: false },
            { name: 'Gold Pieces (GP)', value: "💰 " + gp, inline: true },
        )
        .setFooter({ text: "Requested via " + caller.displayName, iconURL: caller.displayAvatarURL() })
    ] });

}

// Note: possible future expansion, the thumbnail could be the character's avatar if it exists
// This would require a new column in the charlog table and a way to set it (another command?) [migration needed too]
