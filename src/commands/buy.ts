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
import { updateDTP } from "../domain/resource.js";

const CFG = CONFIG.guild!.config;
const RESOURCE_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const MAGIC_ITEMS_CHANNEL_ID = CFG.channels?.magicItems || null;
// helpers
const toCp = (gp: number) => Math.round(gp * 100);
const toGp = (cp: number) => (cp / 100).toFixed(2);
const resourceMapping: { [id: string]: [string, string]; } = {"cp":["GP","💰"], "tp":["GT","🎫"], "dtp":["DTP","🔨"], "xp":["XP","💪"]}

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
      ));

export async function execute(ix: ChatInputCommandInteraction) {
// Channel guard: only allowed in Resource or Magic Items channel (or test override)
  const isInAllowedChannel = ix.channelId === RESOURCE_CHANNEL_ID || ix.channelId === MAGIC_ITEMS_CHANNEL_ID || ix.channelId === DTP_CHANNEL_ID;
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

  if (resource === "dtp"){
    if (await updateDTP(user.id) == null) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('dtp.errors.notInSystem', { username: user.username }),
      });
    }
  }
  
  const row = await getPlayer(user.id);
  if (row) {
    let amount = 0;
    if (resource === "cp") { amount = toCp(amountGp) }
    else { amount = amountGp }
    const updated = await adjustResource(user.id, [resource], [amount * -1])
    if (updated) {
      let newValue = "0";
      if (resource === "tp") { 
        newValue = updated.tp.toFixed();
      }
      else if (resource === "cp") {
        newValue = toGp(updated.cp);
      }
      else if (resource === "dtp") {
        newValue = updated.dtp.toFixed();
      }
      await ix.reply({
        content: t('buy.purchaseSuccessResource', { 
          item, 
          amount: amountGp, 
          newValue, 
          name: updated.name ?? "", 
          resource: resourceMapping[resource]?.[0] ?? '', 
          icon: resourceMapping[resource]?.[1] ?? '' 
        }),
      });
      return;
    }
  }
}

export default { data, execute };