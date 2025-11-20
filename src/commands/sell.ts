import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { getDb } from "../db/index.js";

import { t } from "../lib/i18n.js";

type PlayerRow = {
  userId: string;
  name: string;
  level: number;
  xp: number;
  cp: number; // stored in copper
  tp: number;
  active: boolean;
};

const CFG = CONFIG.guild!.config;
const REWARDS_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const MAGIC_ITEMS_CHANNEL_ID = CFG.channels?.magicItems || null;

// helpers
const toCp = (gp: number) => Math.round(gp * 100);
const toGp = (cp: number) => (cp / 100).toFixed(2);

async function getPlayer(userId: string) {
  const db = await getDb();
  return db.get<PlayerRow>("SELECT * FROM charlog WHERE userId = ? AND active = 1", [userId]);
}

async function addCp(userId: string, deltaCp: number) {
  const db = await getDb();
  await db.run("UPDATE charlog SET cp = cp + ? WHERE userId = ? AND active = 1", [
    deltaCp,
    userId,
  ]);
}

export const data = new SlashCommandBuilder()
  .setName("sell")
  .setDescription("Sell an item for GP and record it to your character log.")
  .addStringOption((opt) =>
    opt
      .setName("item")
      .setDescription("What are you selling?")
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("amount")
      .setDescription("Sale price in GP (must be > 0)")
      .setRequired(true)
      .setMinValue(0.01)
  );

export async function execute(ix: ChatInputCommandInteraction) {
  // Basic permission scaffold (everyone can use; still validates bot perms)

  // Channel guard: only allowed in Resource channel (or test override if you use one)
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

  // sanity checks
  if (!item) {
    await ix.reply({ flags: MessageFlags.Ephemeral, content: t('sell.errors.invalidItem') });
    return;
  }
  if (!(amountGp > 0)) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.errors.invalidAmount'),
    });
    return;
  }
  // reject more than 2 decimal places (GP precision)
  if (Math.round(amountGp * 100) !== amountGp * 100) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.errors.invalidPrecision'),
    });
    return;
  }

  const row = await getPlayer(user.id);
  
  // player must have a record to sell items
  if (!row) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content:
      t('sell.errors.noPlayerRecord', { user: user.toString() }),
    });
    return;
  }
  
  
  const deltaCp = toCp(amountGp);
  await addCp(user.id, deltaCp);
  
  const updated = await getPlayer(user.id);
  const newGp = updated ? toGp(updated.cp) : toGp((row?.cp ?? 0) + deltaCp);
  
  // Embeds disabled as requested per guild. Code left in case we want to re-enable later.
  // const displayName = row?.name ?? (member.displayName || user.username);
  // const embed = new EmbedBuilder()
  //   .setTitle("📜 Sale Recorded")
  //   .setDescription(
  //     t('sell.embed.description', { display: displayName, item, amount: amountGp.toFixed(2), newGp })
  //   )
  //   .setFooter({ text: t('sell.embed.footer', { tag: user.tag }) })
  //   .setTimestamp();

  await ix.reply({ 
    content: t('sell.transactionSuccess', {item, amount: amountGp.toFixed(2), newGp})
    // embeds: [embed] });
  
  });
}

export default { data, execute };