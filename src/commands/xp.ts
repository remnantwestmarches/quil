import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  userMention,
} from "discord.js";
import {
  applyXP,
  levelForXP,
  bandFor,
  proficiencyFor,
} from "../domain/xp.js";
import { CONFIG } from "../config/resolved.js";
import { validateCommandPermissions } from "../config/validaters.js";
import { getDb } from "../db/index.js";
import { t } from "../lib/i18n.js";
const MAGIC_ITEMS_CHANNEL_ID = CONFIG.guild?.config.channels?.magicItems || null;

type PlayerRow = { userId: string; name: string; xp: number; level: number };

async function getPlayerByUserId(userId: string): Promise<PlayerRow | null> {
  const db = await getDb();
    const row = await db.get<PlayerRow>(
    `SELECT userId, name, xp, level FROM charlog WHERE userId = ? AND active = 1`,
    userId
    );
    return row ?? null;
}

async function updatePlayerXPLevel(userId: string, xp: number, level: number, displayName?: string) {
  const db = await getDb();
  const res = await db.run(`UPDATE charlog SET xp = ?, level = ? WHERE userId = ? AND active = 1`, [xp, level, userId]);
  if (res.changes === 0) {
    await db.run(
      `INSERT INTO charlog (userId, name, level, xp, cp, tp, active) VALUES (?, ?, ?, ?, 0, 0, 0)`,
      [userId, displayName ?? `<@${userId}>`, level, xp]
    );
    console.log(`Updated XP/level for ${userId}: ${xp} XP, level ${level}`);
  }
}

// Permissions
const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;

const PERMS = {
  add: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id].filter((id): id is string => id !== undefined),
  adjust: [ROLE.moderator.id, ROLE.admin.id].filter((id): id is string => id !== undefined),
  set: [ROLE.admin.id].filter((id): id is string => id !== undefined),
  show: [] as string[], // empty => everyone
};

const REWARDS_CHANNEL_ID = CFG.channels?.resourceTracking || null;
// ---- Helpers ----

async function announceLevelChange(
  ix: ChatInputCommandInteraction,
  displayName: string,
  newLevel: number,
  diff: number,
  newProf: number
) {
  const msg = diff > 0  ? t('xp.announce.levelUp', { display: displayName, level: newLevel, prof: newProf }) 
                        : t('xp.announce.levelDown', { display: displayName, level: newLevel });

  const guild = ix.guild;
  const target =
    (guild && REWARDS_CHANNEL_ID && guild.channels.cache.get(REWARDS_CHANNEL_ID)) ||
    ix.channel;

  // @ts-expect-error (text channel narrowing omitted)
  await target?.send(msg);
}

// ---- Slash Command Definition ----
export const data = new SlashCommandBuilder()
  .setName("xp")
  .setDescription("XP controls")
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Give XP to a user (positive only)")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("XP to add (≥1)").setRequired(true).setMinValue(1)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (for audit purposes)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("adjust")
      .setDescription("Adjust XP by a signed amount (can remove)")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Signed XP delta, e.g. -50").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (for audit purposes)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("set")
      .setDescription("Set a user's XP to an exact value")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Absolute XP (≥0)").setRequired(true).setMinValue(0)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Why? (for audit purposes)").setMaxLength(200)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("show")
      .setDescription("Show a user's XP, level, and progress")
      .addUserOption((o) => o.setName("user").setDescription("Target (defaults to you)"))
  )

// ---- Executor ----
export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand();
  const member = ix.member as GuildMember | null;

  // Role gates (show = everyone unless configured)
  if (!validateCommandPermissions(ix, member, PERMS)) return;
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

  if (sub === "show") {
    const user = ix.options.getUser("user") ?? ix.user;
    const row = await getPlayerByUserId(user.id);
    if (!row) {
      return ix.reply({ flags: MessageFlags.Ephemeral, content: t('xp.errors.notInSystem', { username: user.username }) });
    }

    const level = levelForXP(row.xp);
    const { curr, next } = bandFor(level);
    const nextDisp = next === null ? "—" : `${next.toLocaleString()} XP (to L${level + 1})`;
    const pct = next === null ? 100 : Math.floor(((row.xp - curr) / (next - curr)) * 100);

    const pctStr = next === null
      ? t("xp.show.fields.max")
      : t("xp.show.progressFmt", { pct, curr: (row.xp - curr).toLocaleString(), range: (next - curr).toLocaleString() });

    const embed = new EmbedBuilder()
      .setAuthor({ name: t("xp.show.author", { name: row.name }) })
      .addFields(
        { name: t("xp.show.fields.level"), value: `**${level}**`, inline: true },
        { name: t("xp.show.fields.xp"),    value: row.xp.toLocaleString(), inline: true },
        { name: t("xp.show.fields.prof"),  value: `+${proficiencyFor(level)}`, inline: true },
        { name: t("xp.show.fields.next"),  value: nextDisp, inline: false },
        { name: t("xp.show.fields.progress"), value: pctStr, inline: false }
      );

        await ix.reply({embeds: [embed] });
        return;
      }

  // Mutations: add / adjust / set
  const user = ix.options.getUser("user", true);
  const reason = ix.options.getString("reason") ?? null;
  const before = await getPlayerByUserId(user.id);

  if (!before) {
    return ix.reply({ flags: MessageFlags.Ephemeral, content: t('xp.errors.notInSystem', { username: user.username }) });
  } 

  if (sub === "add") {
    const amt = ix.options.getInteger("amount", true);
    if (amt <= 0) return ix.reply({ flags: MessageFlags.Ephemeral, content: t('xp.errors.amountMin1') });

    const res = applyXP({ xp: before.xp, level: before.level }, amt);
    await updatePlayerXPLevel(user.id, res.xp, res.level);

    await ix.reply({
      content: t('xp.add.ok', {
        mention: userMention(user.id),
        name: before.name,
        amt,
        newXp: res.xp.toLocaleString(),
        oldLevel: before.level,
        newLevel: res.level,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : ""
      })
    });

    if (res.levelsChanged !== 0) {
      await announceLevelChange(ix, before.name, res.level, res.levelsChanged, res.proficiency);
    }
    return;
  }

  if (sub === "adjust") {
    const amt = ix.options.getInteger("amount", true);

    const res = applyXP({ xp: before.xp, level: before.level }, amt);
    await updatePlayerXPLevel(user.id, res.xp, res.level);
    
    const sign = amt >= 0 ? "+" : "−";

    await ix.reply({
      content: t('xp.adjust.ok', {
        mention: userMention(user.id),
        name: before.name,
        sign,
        absAmt: Math.abs(amt),
        newXp: res.xp.toLocaleString(),
        oldLevel: before.level,
        newLevel: res.level,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : ""
      })
    });


    if (res.levelsChanged !== 0) {
      await announceLevelChange(ix, before.name, res.level, res.levelsChanged, res.proficiency);
    }
    return;
  }

  if (sub === "set") {
    const amt = ix.options.getInteger("amount", true);
    if (amt < 0) return ix.reply({ flags: MessageFlags.Ephemeral, content: t('xp.errors.amountMin0') });

    const newLevel = levelForXP(amt);
    await updatePlayerXPLevel(user.id, amt, newLevel);

    await ix.reply({
      content: t('xp.set.ok', {
        mention: userMention(user.id),
        name: before.name,
        newXp: amt.toLocaleString(),
        newLevel,
        oldLevel: before.level,
        reasonLine: reason ? t('gp.reasonFmt', { reason }) : ""
      })
    });



    const changed = newLevel - before.level;
    if (changed !== 0) {
      await announceLevelChange(ix, before.name, newLevel, changed, proficiencyFor(newLevel));
    }
    return;
  }
}

export default { data, execute };