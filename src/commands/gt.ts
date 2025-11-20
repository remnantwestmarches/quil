import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  userMention,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { getDb } from "../db/index.js";

import { validateCommandPermissions } from "../config/validaters.js";
import { t } from "../lib/i18n.js";

// Note that GT is actually TP (Training Points) in the database. Changed via guild decision.
type PlayerRow = { userId: string; name: string; xp: number; level: number; cp: number; tp: number; active: boolean };

async function getPlayerByUserId(userId: string): Promise<PlayerRow | null>  {
  const db = await getDb();
  const row = await db.get<PlayerRow>(
    `SELECT userId, name, xp, level, cp, tp FROM charlog WHERE userId = ? AND active = 1`,
    userId
  );
  return row ?? null;
}

async function upsertPlayerTP(userId: string, nextTPUnits: number, displayName?: string) {
  const db = await getDb();
  await db.run(
    `
    INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
    VALUES (
      ?, COALESCE((SELECT name FROM charlog WHERE userId = ? AND active = 1), ?),
      COALESCE((SELECT level FROM charlog WHERE userId = ? AND active = 1), 1),
      COALESCE((SELECT xp    FROM charlog WHERE userId = ? AND active = 1), 0),
      COALESCE((SELECT cp    FROM charlog WHERE userId = ? AND active = 1), 0),
      ?,   -- tp
      COALESCE((SELECT active FROM charlog WHERE userId = ? AND active = 1), 0)
    )
    ON CONFLICT(userId,name) DO UPDATE SET
      tp   = excluded.tp,
      name = COALESCE(excluded.name, charlog.name)
    `,
    [userId, userId, displayName ?? `<@${userId}>`, userId, userId, userId, nextTPUnits]
  );
}

const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;

const PERMS = {
  add: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id].filter((id): id is string => id !== undefined),
  adjust: [ROLE.moderator.id, ROLE.admin.id].filter((id): id is string => id !== undefined),
  set: [ROLE.admin.id].filter((id): id is string => id !== undefined),
  show: [] as string[], // empty => everyone
};

export const data = new SlashCommandBuilder()
  .setName("gt")
  .setDescription("Manage a user's Golden Tickets (GT).")
  .addSubcommand(sc =>
    sc.setName("show")
      .setDescription("Show GT for a user")
      .addUserOption(o => o.setName("user").setDescription("Target (defaults to you)"))
  )
  .addSubcommand(sc =>
    sc.setName("add")
      .setDescription("Give GT to a user")
      .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      .addNumberOption(o => o.setName("amount").setDescription("GT to add").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("reason").setDescription("Why? (audit)").setMaxLength(200))
  )
  .addSubcommand(sc =>
    sc.setName("adjust")
      .setDescription("Adjust GT by a signed decimal")
      .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      .addNumberOption(o => o.setName("amount").setDescription("Signed GT delta (e.g., -1)").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Why? (audit)").setMaxLength(200))
  )
  .addSubcommand(sc =>
    sc.setName("set")
      .setDescription("Set a user's GT to an exact value")
      .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      .addNumberOption(o => o.setName("amount").setDescription("Absolute GT (>=0)").setRequired(true).setMinValue(0))
      .addStringOption(o => o.setName("reason").setDescription("Why? (audit)").setMaxLength(200))
  );

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand();
  const member = ix.member as GuildMember | null;

    if (!validateCommandPermissions(ix, member, PERMS)) return;

  if (sub === "show") {
    const user = ix.options.getUser("user") ?? ix.user;
    const row = await getPlayerByUserId(user.id);
    if (!row) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('gt.notInSystem', { username: user.displayName }),
      });  
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${row.name} — Golden Tickets` })
      .addFields(
        { name: "GT", value: `**${row.tp}**`, inline: true },
        { name: "Stored", value: `${row.tp}`, inline: true },
      );
    return ix.reply({embeds: [embed] });
  }

  const user = ix.options.getUser("user", true);
  const reason = ix.options.getString("reason") ?? null;
  const row = await getPlayerByUserId(user.id);
  if (!row) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('gt.notInSystem', { username: user.displayName }),
    });
  }
  
  if (sub === "add") {
    const amt = ix.options.getNumber("amount", true);
    if (amt <= 0) return ix.reply({ ephemeral: true, content: "Amount must be > 0." });
    const deltaUnits = amt;
    const next = Math.max(0, row.tp + deltaUnits);
    await upsertPlayerTP(user.id, next, row.name);
    return ix.reply({
      content: t('gt.add.ok', {
        mention: userMention(user.id),
        name: row.name,
        amt: amt.toFixed(2),
        newGt: next,
        reasonLine: reason ? t('gt.reasonFmt', { reason }) : "",
      }),
    });
  } 

  if (sub === "adjust") {
    const amt = ix.options.getNumber("amount", true);
    const deltaUnits = amt;
    const next = Math.max(0, row.tp + deltaUnits);
    await upsertPlayerTP(user.id, next, row.name);
    const sign = deltaUnits >= 0 ? "+" : "−";
    return ix.reply({
      content: t('gt.adjust.ok', {
        mention: userMention(user.id),
        name: row.name,
        sign,
        absAmt: Math.abs(amt).toFixed(2),
        newGt: next,
        reasonLine: reason ? t('gt.reasonFmt', { reason }) : "",
      }),
    });
  }

  if (sub === "set") {
    const amt = ix.options.getNumber("amount", true);
    const next = amt;
    await upsertPlayerTP(user.id, next, row.name);
    return ix.reply({
      content: t('gt.set.ok', {
        mention: userMention(user.id),
        name: row.name,
        oldGt: row.tp,
        newGt: next,
        reasonLine: reason ? t('gt.reasonFmt', { reason }) : "",
      }),
    });
  }
}

export default { data, execute };
