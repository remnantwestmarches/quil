import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
    MessageFlags,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import { getPlayer } from "../utils/db_queries.js";
import { adjustResource } from "../utils/db_queries.js";

const CFG = CONFIG.guild!.config;
const REWARDS_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const MAGIC_ITEMS_CHANNEL_ID = CFG.channels?.magicItems || null;
// helpers
const toCp = (gp: number) => Math.round(gp * 100);
const toGp = (cp: number) => (cp / 100).toFixed(2);

export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Buy an item for GP or GT and record it to the resource log.")
  .addStringOption((opt) =>
    opt
      .setName("item")
      .setDescription("What are you buying?")
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("amount")
      .setDescription("Sale price in GP|GT|DTP (must be > 0)")
      .setRequired(true)
      .setMinValue(0)
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("Is this purchase to be made with GT or DTP? (Default: GP)")
      .setRequired(false)
      .addChoices(
        { name: "GP (Gold Pieces)", value: "cp" },
        { name: "GT (Golden Tickets)", value: "tp" },
        { name: "DTP (Downtime)", value: "dtp" }
      )
  )
  ;

export async function execute(ix: ChatInputCommandInteraction) {
// Channel guard: only allowed in Resource or Magic Items channel (or test override)
  const isInAllowedChannel = ix.channelId === REWARDS_CHANNEL_ID || ix.channelId === MAGIC_ITEMS_CHANNEL_ID || ix.channelId === DTP_CHANNEL_ID;
  const isInConfiguredGuild = ix.guildId === CONFIG.guild?.id;

  if (!isInAllowedChannel && isInConfiguredGuild) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.notInResourceChannel'),
    });
    return;
  }

  const member = ix.member as GuildMember;
  const user = member.user;

  const item = ix.options.getString("item", true).trim();
  const amountGp = ix.options.getNumber("amount", true);
  let resource = ix.options.getString("type") || "cp";

  // sanity checks
  if (!item) {
    await ix.reply({ flags: MessageFlags.Ephemeral, content: t('buy.errors.invalidItem') });
    return;
  }
  if (!(amountGp > 0)) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.invalidAmount'),
    });
    return;
  }
  // reject more than 2 decimal places (GP precision)
  if (Math.round(amountGp * 100) !== amountGp * 100) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.invalidPrecision'),
    });
    return;
  }
  
  const row = await getPlayer(user.id);
  if (!row) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.noPlayerRecord', { user: user.username }),
    });
    return;
  }
  
  // any purchase
  let amount = 0;
  if (resource === "cp") { amount = toCp(amountGp) }
  else { amount = amountGp }
  await adjustResource(user.id, [resource], [amount * -1])

  const updated = await getPlayer(user.id);
  const icons: { [id: string]: string; } = {"GP":"💰", "GT":"🎫", "DTP":"🔨"}
  const name = row.name;
  let newGt = 0;
  if (resource === "tp") { 
    resource = "GT" //rename again for display
    newGt = updated ? updated.tp : Math.max(0, (row?.tp ?? 0) - amount);
  }
  else if (resource === "cp") {
    resource = "GP"
    amount = Math.round(amount / 100)
    newGt = updated ? Math.round(updated.cp / 100) : Math.max(0, (row?.cp ?? 0) - amount);
  }
  else if (resource === "dtp") {
    resource = "DTP"
    newGt = updated ? updated.dtp : Math.max(0, (row?.dtp ?? 0) - amount);
  }
  
  await ix.reply({
    content: t('buy.purchaseSuccessResource', { item, amount: amount.toFixed(0), newGt, name, resource: resource, icon: icons[resource] ?? '' }),
  });
  return;
}

export default { data, execute };