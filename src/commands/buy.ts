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
      .setDescription("Sale price in GP|GT (must be > 0)")
      .setRequired(true)
      .setMinValue(0.01)
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("Is this purchase to be made with GT? (Default: GP)")
      .setRequired(false)
      .addChoices(
        { name: "GP (Gold Pieces)", value: "gp" },
        { name: "GT (Golden Tickets)", value: "gt" }
      )
  )
  ;

export async function execute(ix: ChatInputCommandInteraction) {
// Channel guard: only allowed in Resource or Magic Items channel (or test override)
  const isInAllowedChannel = ix.channelId === REWARDS_CHANNEL_ID || ix.channelId === MAGIC_ITEMS_CHANNEL_ID;
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
  const resource = ix.options.getString("type") || "gp";

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
  
  // GT purchase
  if (resource === "gt") {
    const amountGt = amountGp;
    await adjustResource(user.id, ["tp"], [amountGt * -1])

    const updated = await getPlayer(user.id);
    const name = row.name;
    const newGt = updated ? updated.tp : Math.max(0, (row?.tp ?? 0) - amountGt);
    
    await ix.reply({
      content: t('buy.purchaseSuccessGT', { item, amount: amountGt.toFixed(2), newGt, name }),
    });
    return;
  } 

  // GP purchase
  const deltaCp = toCp(amountGp);
  await adjustResource(user.id, ["cp"], [deltaCp * -1])
  
  const updated = await getPlayer(user.id);
  const newGp = updated ? toGp(updated.cp) : toGp((row?.cp ?? 0) + deltaCp);
  const name = row.name

  await ix.reply({
    content: t('buy.purchaseSuccess', { item, amount: amountGp.toFixed(2), newGp, name }),
  });
}

export default { data, execute };