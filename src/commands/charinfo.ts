// commands/charinfo.ts
import { AutocompleteInteraction, SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { t } from "../lib/i18n.js";
import { characterAutocomplete } from "../utils/autocomplete.js";
import { getPlayer } from "../utils/db_queries.js";

export const data = new SlashCommandBuilder()
  .setName("charinfo")
  .setDescription("Show your character info (or mention a user)")
  .addUserOption((o) => o.setName("user").setDescription("Target user"))
  .addStringOption((o) => o.setName("character").setDescription("Target character").setAutocomplete(true));


export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user") ?? interaction.user;
  const char = interaction.options.getString("character") ?? undefined;
  const caller = interaction.user;
  const row = await getPlayer(user.id, char)
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
