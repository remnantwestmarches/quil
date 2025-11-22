import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
  userMention,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import { validateCommandPermissions } from "../config/validaters.js";
import { adjustResource, getPlayer } from "../utils/db_queries.js";

const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;
const PERMS = {
  add: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id].filter(
    Boolean
  ) as string[],
  adjust: [ROLE.moderator.id, ROLE.admin.id].filter(Boolean) as string[],
  set: [ROLE.admin.id].filter(Boolean) as string[],
  show: [] as string[],
};
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const RESOURCE_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const DTP_RATE = CFG.features.dtp?.rate || 1;

export const data = new SlashCommandBuilder()
  .setName("dtp")
  .setDescription(
    "Manage a user's downtime points (DTP)."
  )
  .addSubcommand((sc) =>
    sc
      .setName("show")
      .setDescription("Show DTP for a user")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target (defaults to you)")
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Give DTP to a user (positive number)")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("amount")
          .setDescription("DTP to add (e.g., 5)")
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("adjust")
      .setDescription("Adjust DTP by a positive or negative number")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("amount")
          .setDescription("Signed DTP delta (e.g., -3)")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("set")
      .setDescription("Set a user's DTP to an exact value")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("amount")
          .setDescription("Absolute DTP (>=0)")
          .setRequired(true)
          .setMinValue(0)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  );

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand();
  const member = ix.member as GuildMember | null;
  
  // Permission guard
  if (!validateCommandPermissions(ix, member, PERMS)) {
    return; 
  }
  
  // Channel guard: only allowed in Resource channel or Magic Items channel (override for dev/test)
  const isInAllowedChannel = ix.channelId === DTP_CHANNEL_ID || ix.channelId === RESOURCE_CHANNEL_ID;
  const isInConfiguredGuild = ix.guildId === CONFIG.guild?.id;

  if (!isInAllowedChannel && isInConfiguredGuild) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.notInResourceChannel'),
    });
    return;
  }

  let user = ix.options.getUser("user") ?? ix.user;
  let row = await getPlayer(user.id);
  if (!row) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('dtp.errors.notInSystem', { username: user.username }),
    });
  }
  const timestamp = Math.round(new Date().getTime() / 1000)
  const timestampNormal = timestamp - (timestamp % Math.round(86400 / DTP_RATE))
  const dtpcalc = row.dtp + ((timestampNormal - row.dtp_updated) / Math.round(86400 / DTP_RATE))
  await adjustResource(user.id, ["dtp", "dtp_updated"], [dtpcalc, timestampNormal], true, row.name);

  if (sub === "show") {
    const row = await getPlayer(user.id);
    if (!row) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('dtp.errors.notInSystem', { username: user.displayName }),
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${row.name} — downtime points` })
      .addFields(
        { name: "DTP", value: ` 🔨 **${row.dtp}**`, inline: false }
      );
    return ix.reply({embeds: [embed] });
  }

  // mutating subcommands
  user = ix.options.getUser("user", true);
  const reason = ix.options.getString("reason") ?? null;
  row = await getPlayer(user.id);

  if (!row) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('gp.errors.notInSystem', { username: user.username }),
    });
  }

  if (sub === "add") {
    const amt = ix.options.getInteger("amount", true);
    if (amt <= 0)
      return ix.reply({ flags: MessageFlags.Ephemeral, content: t('gp.errors.invalidAmount') });

    const next = Math.max(0, row.dtp + amt);
    await adjustResource(user.id, ["dtp"], [next], true, row.name);

    await ix.reply({
      content: t('dtp.add.ok', {
        mention: userMention(user.id),
        name: row.name,
        amt: amt,
        newDTP: next,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });

    return;
  }

  if (sub === "adjust") {
    const amt = ix.options.getInteger("amount", true);
    const next = Math.max(0, row.dtp + amt);
    await adjustResource(user.id, ["dtp"], [next], true, row.name);
    const sign = amt >= 0 ? "+" : "-";

    await ix.reply({
      content: t('dtp.adjust.ok', {
        mention: userMention(user.id),
        name: row.name,
        sign: sign,
        absAmt: amt,
        newDTP: next,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });
  
    return;
  }

  if (sub === "set") {
    const amt = ix.options.getInteger("amount", true);
    const oldDtp = row.dtp;
    const next = amt;
    await adjustResource(user.id, ["dtp"], [next], true, row.name);
    await ix.reply({
      content: t('dtp.set.ok', {
        mention: userMention(user.id),
        name: row.name,
        amt: amt,
        newDTP: next,
        oldDTP: oldDtp,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });

    return;
  }
}

export default { data, execute };