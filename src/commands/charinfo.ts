// commands/charinfo.ts
import { AutocompleteInteraction, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { characterAutocomplete } from "../utils/autocomplete.js";
import { showCharacterEmbed } from "../utils/embeds.js";
import { LootService } from "./mip.js";

export const data = new SlashCommandBuilder()
  .setName("charinfo")
  .setDescription("Show your character info (or mention a user)")
  .addUserOption((o) => o.setName("user").setDescription("Target user"))
  .addStringOption((o) => o.setName("character").setDescription("Target character").setAutocomplete(true));


export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  
  //const table = "Table G1"; // Example input
  //const type = "gambling";
  //const rolls = 5;

  //const lootBot = new LootService();
  
  //await lootBot.loadTables();

  //const itemsRolled = lootBot.processCommand(table, type, rolls);

  //showCharacterEmbed(interaction, {title: `Rolled ${rolls} time${rolls > 1 ? "s" : ""} on ${table} (${type}):`, desc:`${itemsRolled.join('\n')}`})
  showCharacterEmbed(interaction)
}