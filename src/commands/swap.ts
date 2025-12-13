// src/commands/initiate.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { setActive } from '../utils/db_queries.js';
import { showCharacterEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('swap')
  .setDescription('Swap to another character')
  .addStringOption(o =>
    o.setName('name').setDescription("Adventurer's name").setRequired(true).setAutocomplete(true))


export async function execute(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString('name', true).trim()
  await setActive(interaction.user.id, name)
  showCharacterEmbed(interaction, {title: `Switched Character - ${name}`})
}