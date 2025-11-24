// src/commands/initiate.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AutocompleteInteraction,
} from 'discord.js';
import { getDb } from '../db/index.js';
import { t } from '../lib/i18n.js';
import { getPlayer } from '../utils/db_queries.js';
import { characterAutocomplete } from '../utils/autocomplete.js';

export const data = new SlashCommandBuilder()
  .setName('swap')
  .setDescription('Swap to another character')
  .addStringOption(o =>
    o.setName('name').setDescription("Adventurer's name").setRequired(true).setAutocomplete(true))

export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {

  // --- inputs ---
  const db = getDb();
  const targetUser = interaction.user
  const rawName = interaction.options.getString('name', true).trim();

  // name validation (letters/numbers/spaces/apostrophes/hyphens)
  if (!/^[a-zA-Z0-9'\- ]+$/.test(rawName)) {
    await interaction.reply({ ephemeral: true, content:
      'Invalid character name. Use letters, numbers, spaces, apostrophes, or hyphens.' });
    return;
  }

  const found = await getPlayer(targetUser.id, rawName)

  if (!found){
    await interaction.reply({ ephemeral: true, content: 'There is no entry with that name in the guild ledger.' });
    return;
  }

  await db.run(
    `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
    targetUser.id,
    rawName
  );
  
  await db.run(
    `UPDATE charlog SET active = 1 WHERE userId = ? AND name = ?`,
    targetUser.id,
    rawName
  );

  const gp = (found.cp / 100).toFixed(2);
  const tp = (found.tp).toFixed(1);

  // reply (no role changes, no fund debit)
  await interaction.reply({embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff) // set to brand color
          .setThumbnail(targetUser.displayAvatarURL())
          .setTitle(`Switched Character — ${found.name}`)
          .setDescription("OOC Owner: " + targetUser.toString())
          .addFields(
            { name: 'Level', value: "⭐ " + String(found.level), inline: true },
            { name: 'Experience (XP)', value:"💪 " + String(found.xp), inline: true })
            .addFields(
              { name: 'Golden Tickets (GT)', value: "🎫 " + tp, inline: false },
              { name: 'Gold Pieces (GP)', value: "💰 " + gp, inline: true },
          )
          .setFooter({ text: "Requested via " + targetUser.displayName, iconURL: targetUser.displayAvatarURL() })
      ] });
}