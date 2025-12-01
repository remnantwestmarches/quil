// src/commands/initiate.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { setActive } from '../utils/db_queries.js';
import { characterAutocomplete } from '../utils/autocomplete.js';
import { showCharacterEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('swap')
  .setDescription('Swap to another character')
  .addStringOption(o =>
    o.setName('name').setDescription("Adventurer's name").setRequired(true).setAutocomplete(true))

export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString('name', true).trim()
  await setActive(interaction.user.id, name)
  showCharacterEmbed(interaction, {title: `Switched Character - ${name}`})
}