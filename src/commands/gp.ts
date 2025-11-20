import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  userMention
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { validateCommandPermissions } from "../config/validaters.js";
import { getDb } from "../db/index.js";
import { t } from "../lib/i18n.js";
const MAGIC_ITEMS_CHANNEL_ID = CONFIG.guild?.config.channels?.magicItems || null;

// --- Types / DB ---
type PlayerRow = {
  userId: string;
  name: string;
  xp: number;
  level: number;
  cp: number;
  tp: number;
  active: boolean;
};

async function getPlayerByUserId(userId: string): Promise<PlayerRow | null>  {
  const db = await getDb();
  const row = await db.get<PlayerRow>(
    `SELECT userId, name, xp, level, cp, tp FROM charlog WHERE userId = ? AND active = 1`,
    userId
  );
  return row ?? null;
}

async function upsertPlayerCP(
  userId: string,
  nextCP: number,
  displayName?: string
) {
  const db = await getDb();
  await db.run(
    `
    INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
    VALUES (
      ?, COALESCE((SELECT name FROM charlog WHERE userId = ? AND active = 1), ?),
      COALESCE((SELECT level  FROM charlog WHERE userId = ? AND active = 1), 1),
      COALESCE((SELECT xp     FROM charlog WHERE userId = ? AND active = 1), 0),
      ?,  -- cp
      COALESCE((SELECT tp     FROM charlog WHERE userId = ? AND active = 1), 0),
      COALESCE((SELECT active FROM charlog WHERE userId = ? AND active = 1), 0)
    )
    ON CONFLICT(userId,name) DO UPDATE SET
      cp   = excluded.cp,
      name = COALESCE(excluded.name, charlog.name)
    `,
    [
      userId,
      userId,
      displayName ?? `<@${userId}>`,
      userId,
      userId,
      nextCP,
      userId,
    ]
  );
}

// --- Permissions from AppConfig ---
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
const REWARDS_CHANNEL_ID = CFG.channels?.resourceTracking || null;

// --- Helpers ---
function toCp(amountGp: number) {
  return Math.round(amountGp * 100);
}
function toGpString(cp: number) {
  return (cp / 100).toFixed(2);
}

export const data = new SlashCommandBuilder()
  .setName("gp")
  .setDescription(
    "Manage a user's gold (GP). Stored internally as copper (CP)."
  )
  .addSubcommand((sc) =>
    sc
      .setName("show")
      .setDescription("Show GP for a user")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target (defaults to you)")
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Give GP to a user (positive decimal)")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addNumberOption((o) =>
        o
          .setName("amount")
          .setDescription("GP to add (e.g., 12.5)")
          .setRequired(true)
          .setMinValue(0.01)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("adjust")
      .setDescription("Adjust GP by a positive or negative decimal amount")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addNumberOption((o) =>
        o
          .setName("amount")
          .setDescription("Signed GP delta (e.g., -350.75)")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("set")
      .setDescription("Set a user's GP to an exact value")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addNumberOption((o) =>
        o
          .setName("amount")
          .setDescription("Absolute GP (>=0)")
          .setRequired(true)
          .setMinValue(0)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (audit)").setMaxLength(200)
      )
  )

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand();
  const member = ix.member as GuildMember | null;

  // Permission guard
  if (!validateCommandPermissions(ix, member, PERMS)) {
    return; 
  }

  // Channel guard: only allowed in Resource channel or Magic Items channel (override for dev/test)
  const isInAllowedChannel = ix.channelId === REWARDS_CHANNEL_ID || ix.channelId === MAGIC_ITEMS_CHANNEL_ID;
  const isInConfiguredGuild = ix.guildId === CONFIG.guild?.id;

  if (!isInAllowedChannel && isInConfiguredGuild) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.notInResourceChannel'),
    });
    return;
  }


  if (sub === "show") {
    const user = ix.options.getUser("user") ?? ix.user;
    const row = await getPlayerByUserId(user.id);
    if (!row) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('gp.errors.notInSystem', { username: user.displayName }),
      });
    }


    const embed = new EmbedBuilder()
      .setAuthor({ name: `${row.name} — Wallet` })
      .addFields(
        { name: "GP", value: ` 💰 **${toGpString(row.cp)}**`, inline: false },
        { name: "CP (stored)", value: "🪙 " + row.cp.toString(), inline: false }
      );
    return ix.reply({embeds: [embed] });
  }

  // mutating subcommands
  const user = ix.options.getUser("user", true);
  const reason = ix.options.getString("reason") ?? null;
  const row = await getPlayerByUserId(user.id);

  if (!row) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('gp.errors.notInSystem', { username: user.username }),
    });
  }

  if (sub === "add") {
    const amtGp = ix.options.getNumber("amount", true);
    if (amtGp <= 0)
      return ix.reply({ flags: MessageFlags.Ephemeral, content: t('gp.errors.invalidAmount') });

    const delta = toCp(amtGp);
    const next = Math.max(0, row.cp + delta);
    await upsertPlayerCP(user.id, next, row.name);

    await ix.reply({
      content: t('gp.add.ok', {
        mention: userMention(user.id),
        name: row.name,
        amt: amtGp.toFixed(2),
        newGp: toGpString(next),
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });

    return;
  }

  if (sub === "adjust") {
    const amtGp = ix.options.getNumber("amount", true);
    const delta = toCp(amtGp);
    const next = Math.max(0, row.cp + delta);
    await upsertPlayerCP(user.id, next, row.name);
    const sign = delta >= 0 ? "+" : "-";

    await ix.reply({
      content: t('gp.adjust.ok', {
        mention: userMention(user.id),
        name: row.name,
        sign: sign,
        absAmt: Math.abs(amtGp).toFixed(2),
        newGp: toGpString(next),
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });
  
    return;
  }

  if (sub === "set") {
    const amtGp = ix.options.getNumber("amount", true);
    const oldGp = toGpString(row.cp);
    const next = toCp(amtGp);
    await upsertPlayerCP(user.id, next, row.name);
    await ix.reply({
      content: t('gp.set.ok', {
        mention: userMention(user.id),
        name: row.name,
        amt: amtGp.toFixed(2),
        newGp: toGpString(next),
        oldGp: oldGp,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : "",
      }),
    });

    return;
  }
}

export default { data, execute };
