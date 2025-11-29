// commands/charinfo.ts
import { AutocompleteInteraction, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { characterAutocomplete } from "../utils/autocomplete.js";
import { showCharacterEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("charinfo")
  .setDescription("Show your character info (or mention a user)")
  .addUserOption((o) => o.setName("user").setDescription("Target user"))
  .addStringOption((o) => o.setName("character").setDescription("Target character").setAutocomplete(true));


export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  showCharacterEmbed(interaction)
}