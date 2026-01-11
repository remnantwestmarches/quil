import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import { getPlayer, getPlayerCC } from "../utils/db_queries.js";
import { adjustResource } from "../utils/db_queries.js";
import { updateDTP } from "../domain/resource.js";

const CFG = CONFIG.guild!.config;
const RESOURCE_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const MAGIC_ITEMS_CHANNEL_ID = CFG.channels?.magicItems || null;
// helpers
const toCp = (gp: number) => Math.round(gp * 100);
const toGp = (cp: number) => (cp / 100).toFixed(2);
const resourceMapping: { [id: string]: [string, string]; } = {"cp":["GP","💰"], "tp":["GT","🎫"], "dtp":["DTP","🔨"], "cc":["CC","🪙"], "xp":["XP","💪"]}

export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("Buy an item for GP, GT, and/or DTP and record it to the resource log.")
  .addStringOption((opt) =>
    opt
      .setName("item")
      .setDescription("What are you buying?")
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("gp")
      .setDescription("GP (Gold Pieces) to spend")
      .setMinValue(0)
  )
  .addNumberOption((opt) =>
    opt
      .setName("gt")
      .setDescription("GT (Golden Tickets) to spend")
      .setMinValue(0)
  )
  .addNumberOption((opt) =>
    opt
      .setName("dtp")
      .setDescription("DTP (Downtime Points) to spend")
      .setMinValue(0)
  )
  .addNumberOption((opt) =>
    opt
      .setName("cc")
      .setDescription("CC (Crew Coins) to spend")
      .setMinValue(0)
  );

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
  const gpInput = ix.options.getNumber("gp") ?? 0;
  const gtInput = ix.options.getNumber("gt") ?? 0;
  const dtpInput = ix.options.getNumber("dtp") ?? 0;
  const ccInput = ix.options.getNumber("cc") ?? 0;

  // Permission check: CC is crew+ only
  if (ccInput > 0) {
    const crewRoleId = CFG.roles.member.id;
    const hasCrew = crewRoleId && member.roles.cache.has(crewRoleId);
    if (!hasCrew) {
      await ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('buy.errors.ccCrewOnly'),
      });
      return;
    }
  }

  // Validation: at least one resource must be specified
  if (gpInput === 0 && gtInput === 0 && dtpInput === 0 && ccInput === 0) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.noResourceSpecified'),
    });
    return;
  }

  // Update DTP if needed
  if (dtpInput > 0) {
    if (await updateDTP(user.id) == null) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('dtp.errors.notInSystem', { username: user.username }),
      });
    }
  }
  
  const row = await getPlayer(user.id);
  if (!row) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.noPlayerRecord', { user: user.username }),
    });
    return;
  }

  // Validate sufficient funds for all requested resources
  const insufficientResources: string[] = [];
  
  if (gpInput > 0 && row.cp < toCp(gpInput)) {
    insufficientResources.push("💰 GP");
  }
  if (gtInput > 0 && row.tp < gtInput) {
    insufficientResources.push("🎫 GT");
  }
  if (dtpInput > 0 && row.dtp < dtpInput) {
    insufficientResources.push("🔨 DTP");
  }
  if (ccInput > 0) {
    const playerCC = await getPlayerCC(user.id);
    if (playerCC < ccInput) {
      insufficientResources.push("🪙 CC");
    }
  }

  if (insufficientResources.length > 0) {
    const resourceList = insufficientResources.join(", ");
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('buy.errors.noFunds', { resources: resourceList }),
    });
    return;
  }

  // Build resource adjustment arrays
  const columns: string[] = [];
  const values: number[] = [];
  
  if (gpInput > 0) {
    columns.push("cp");
    values.push(toCp(gpInput) * -1);
  }
  if (gtInput > 0) {
    columns.push("tp");
    values.push(gtInput * -1);
  }
  if (dtpInput > 0) {
    columns.push("dtp");
    values.push(dtpInput * -1);
  }
  if (ccInput > 0) {
    columns.push("cc");
    values.push(ccInput * -1);
  }

  const updated = await adjustResource(user.id, columns, values);
  if (!updated) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('errors.generic'),
    });
    return;
  }

  // Build cost and balance strings for response
  const costParts: string[] = [];
  const balanceParts: string[] = [];
  
  if (gpInput > 0) {
    costParts.push(`💰 **${gpInput} GP**`);
    balanceParts.push(`💰 **${toGp(updated.cp)} GP**`);
  }
  if (gtInput > 0) {
    costParts.push(`🎫 **${gtInput} GT**`);
    balanceParts.push(`🎫 **${updated.tp} GT**`);
  }
  if (dtpInput > 0) {
    costParts.push(`🔨 **${dtpInput} DTP**`);
    balanceParts.push(`🔨 **${updated.dtp} DTP**`);
  }
  if (ccInput > 0) {
    const playerCC = await getPlayerCC(user.id);
    costParts.push(`🪙 **${ccInput} CC**`);
    balanceParts.push(`🪙 **${playerCC} CC**`);
  }

  const costStr = costParts.join(", ");
  const balanceStr = balanceParts.join(" · ");

  await ix.reply({
    content: t('buy.purchaseSuccessMulti', { 
      item, 
      cost: costStr, 
      balance: balanceStr,
      name: updated.name ?? ""
    }),
  });
}

export default { data, execute };