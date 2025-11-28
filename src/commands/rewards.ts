import {
  User,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  userMention,
  MessageFlags,
  AutocompleteInteraction,
} from "discord.js";

import { CONFIG } from "../config/resolved.js";
import { adjustResource, getPlayer } from "../utils/db_queries.js";

// Domain logic
import {
  computeCustomReward,
  computeDmReward,
  applyResourceDeltas,
} from "../domain/rewards.js";
import { levelForXP, proficiencyFor } from "../domain/xp.js";

import { t } from "../lib/i18n.js";
import { characterAutocomplete } from "../utils/autocomplete.js";


/* ──────────────────────────────────────────────────────────────────────────────
   CONFIG / PERMISSIONS
────────────────────────────────────────────────────────────────────────────── */
const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;

const PERMS = {
  custom: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id, ROLE.keeper.id],
  dm: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id, ROLE.keeper.id],
  staff: [ROLE.moderator.id, ROLE.admin.id, ROLE.keeper.id],
};

const REWARDS_CHANNEL_ID = CFG.channels?.resourceTracking;

function hasAnyRole(member: GuildMember | null, allowed: string[]) {
  if (!member || !allowed?.length) return false;
  const have = new Set(member.roles.cache.map((r) => r.id));
  return allowed.some((rid) => have.has(rid));
}

function isAdmin(member: GuildMember | null) {
  try {
    return !!member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

// Optional dev bypass while testing
const SUPERUSER_IDS = (process.env.DEV_SUPERUSERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function isDevBypass(ix: ChatInputCommandInteraction) {
  return CONFIG.env !== "prod" && SUPERUSER_IDS.includes(ix.user.id);
}

/* ──────────────────────────────────────────────────────────────────────────────
   SLASH COMMAND DEFINITION
────────────────────────────────────────────────────────────────────────────── */
export const data = new SlashCommandBuilder()
  .setName("reward")
  .setDescription("Award XP/GP/GT to players or claim DM/Staff rewards (config-driven).")
  // custom
  .addSubcommand((sc) =>
    sc
      .setName("custom")
      .setDescription("Award explicit XP/GP/GT to one or more players.")
      .addUserOption((o) => o.setName("user1").setDescription("Target #1").setRequired(true))
      .addUserOption((o) => o.setName("user2").setDescription("Target #2"))
      .addUserOption((o) => o.setName("user3").setDescription("Target #3"))
      .addUserOption((o) => o.setName("user4").setDescription("Target #4"))
      .addUserOption((o) => o.setName("user5").setDescription("Target #5"))
      .addUserOption((o) => o.setName("user6").setDescription("Target #6"))
      .addUserOption((o) => o.setName("user7").setDescription("Target #7"))
      .addUserOption((o) => o.setName("user8").setDescription("Target #8"))
      .addUserOption((o) => o.setName("user9").setDescription("Target #9"))
      .addUserOption((o) => o.setName("user10").setDescription("Target #10"))
      .addStringOption((o) => o.setName("char1").setDescription("Character #1").setAutocomplete(true))
      .addStringOption((o) => o.setName("char2").setDescription("Character #2").setAutocomplete(true))
      .addStringOption((o) => o.setName("char3").setDescription("Character #3").setAutocomplete(true))
      .addStringOption((o) => o.setName("char4").setDescription("Character #4").setAutocomplete(true))
      .addStringOption((o) => o.setName("char5").setDescription("Character #5").setAutocomplete(true))
      .addStringOption((o) => o.setName("char6").setDescription("Character #6").setAutocomplete(true))
      .addStringOption((o) => o.setName("char7").setDescription("Character #7").setAutocomplete(true))
      .addStringOption((o) => o.setName("char8").setDescription("Character #8").setAutocomplete(true))
      .addStringOption((o) => o.setName("char9").setDescription("Character #9").setAutocomplete(true))
      .addStringOption((o) => o.setName("char10").setDescription("Character #10").setAutocomplete(true))
      .addIntegerOption((o) => o.setName("xp").setDescription("XP to award (>=0)").setMinValue(0))
      .addNumberOption((o) => o.setName("gp").setDescription("GP to award (>=0)").setMinValue(0))
      .addNumberOption((o) => o.setName("gt").setDescription("GT to award (>=0").setMinValue(0))
      .addStringOption((o) => o.setName("reason").setDescription("Why? (for audit purposes)").setMaxLength(200))
  )
  // dm self-claim
  .addSubcommand((sc) =>
    sc
      .setName("dm")
      .setDescription("Claim DM reward for yourself based on your character level.")
      .addStringOption((o) => o.setName("reason").setDescription("Why? (optional)").setMaxLength(200))
  )


/* ──────────────────────────────────────────────────────────────────────────────
   EXECUTOR
────────────────────────────────────────────────────────────────────────────── */
export async function autocomplete(interaction: AutocompleteInteraction) {
  await characterAutocomplete(interaction);
}

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand() as "custom" | "dm" | "staff";
  const member = ix.member as GuildMember | null;

  // Permissions
  const allowed =
    hasAnyRole(member, PERMS[sub].filter((id): id is string => id !== undefined)) || isAdmin(member) || isDevBypass(ix);

  if (!allowed) {
    await ix.reply({ flags: MessageFlags.Ephemeral, content: t("reward.errors.noPermission")});
    return;
  }

  if (sub === "custom") return handleCustom(ix);
  if (sub === "dm") return handleDm(ix);
}

/* ──────────────────────────────────────────────────────────────────────────────
   HANDLERS
────────────────────────────────────────────────────────────────────────────── */
type UserOptionName = `user${number}`;
type CharacterOptionName = `char${number}`
type UserCharacterTuple = [User, string | null];

function collectUsers(ix: ChatInputCommandInteraction, max = 10): UserCharacterTuple[] {
  const users: UserCharacterTuple[] = [];
  for (let i = 1; i <= max; i++) {
    const u = ix.options.getUser(`user${i}` as UserOptionName);
    const c = ix.options.getString(`char${i}` as CharacterOptionName);
    if (u) users.push([u,c]);
  }
  return users;
}

function fmtGp(cp: number) {
  return (cp / 100).toFixed(2);
}

async function announceLevelChange(
  ix: ChatInputCommandInteraction,
  userId: string,
  displayName: string,
  newLevel: number,
  diff: number
) {

  const msg = diff > 0
    ? t("reward.announce.levelUp",   { mention: userMention(userId), display: displayName, level: newLevel, prof: proficiencyFor(newLevel) })
    : t("reward.announce.levelDown", { mention: userMention(userId), display: displayName, level: newLevel });
  const guild = ix.guild;
  const target =
    (guild && REWARDS_CHANNEL_ID && guild.channels.cache.get(REWARDS_CHANNEL_ID)) ||
    ix.channel;

  // @ts-expect-error narrowing omitted
  await target?.send(msg);
}

/* CUSTOM: explicit xp/gp/tp to multiple users (optional auto TP) */
async function handleCustom(ix: ChatInputCommandInteraction) {
  const recipients = collectUsers(ix);
  const xpIn = ix.options.getInteger("xp") ?? 0;
  const gpIn = ix.options.getNumber("gp") ?? 0;
  const tpIn = ix.options.getNumber("gt") ?? 0;
  const tpAuto = ix.options.getNumber("gt") ? false : (ix.options.getNumber("gp") || ix.options.getInteger("xp")) ? true : false;
  const reason = ix.options.getString("reason") ?? null;

  if (!recipients.length) {
    await ix.reply({ flags: MessageFlags.Ephemeral, content: t("reward.errors.noRecipients") });
    return;
  }
  if (!tpAuto && xpIn === 0 && gpIn === 0 && tpIn === 0) {
    await ix.reply({ flags: MessageFlags.Ephemeral, content: t("reward.errors.noInputs") });
    return;
  }

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  for (const [u, c] of recipients) {
    const before = await getPlayer(u.id,c ?? "");
    if (!before) {
      await ix.reply({ flags: MessageFlags.Ephemeral, content: t("reward.errors.userNotInSystem", { username: u.username }) });
      return;
    }

    const level = levelForXP(before.xp);

    let tp = 0;
    if (tpAuto){
      tp = level < 5 ? 3 : level < 11 ? 4 : level < 17 ? 5 : 6;
    }
    else {
      tp = Math.round((tpIn ?? 0));
    }

    const delta = computeCustomReward({ xp: xpIn, gp: gpIn, tp });

    const next = applyResourceDeltas(before, { ...delta, tp });
    adjustResource(u.id, ["cp","tp","xp","level"], [next.cp,next.tp,next.xp,next.level], true, before.name)

    if (next.levelsChanged !== 0) {
      await announceLevelChange(ix, u.id, before.name, next.level, next.levelsChanged);
    }
    
    // Embed
    // field text
    const heading = t("reward.custom.fieldHeading", { username: u.displayName, charName: before.name });
    const deltaStr = t("reward.custom.fmt.delta", { xp: delta.xp ?? 0, gp: fmtGp(delta.cp ?? 0), gt: tp });
    const beforeStr = t("reward.custom.fmt.before", { xp: before.xp.toLocaleString(), level, gp: fmtGp(before.cp), gt: before.tp });
    const afterStr  = t("reward.custom.fmt.after",  { xp: next.xp.toLocaleString(),  level: next.level, gp: fmtGp(next.cp), gt: next.tp });

    fields.push({
      name: heading,
      value: t("reward.custom.fieldBody", { before: beforeStr, after: afterStr, delta: deltaStr })
    });
  }

  const mentionList = recipients.map(([u,c]) => userMention(u.id)).join(" ");

  const embed = new EmbedBuilder()
    .setTitle(t("reward.custom.title"))
    .addFields(fields)
    .setFooter({ text: reason ? t("reward.common.footerReason", { reason }) : t("reward.common.footerDash") });


  // Content pings; embed shows details without pinging in field names
  await ix.reply({
    content: t("reward.custom.contentApplied", { mentions: mentionList }),
    embeds: [embed],
    allowedMentions: { users: recipients.map(([u,c]) => u.id) }
  });
}

/* DM: invoker claims bracketed DM reward for self */
async function handleDm(ix: ChatInputCommandInteraction) {
  const u = ix.user;
  const reason = ix.options.getString("reason") ?? null;

  const before = await getPlayer(u.id,"");

  if (!before) {
    return ix.reply({ flags: MessageFlags.Ephemeral, content: t("reward.errors.dmNoRecord") });
  }

  const level = levelForXP(before.xp);

  const delta = computeDmReward(level);
  const next = applyResourceDeltas(before, delta);
  adjustResource(u.id, ["cp","tp","xp","level"], [next.cp,next.tp,next.xp,next.level], true, before.name)

  if (next.levelsChanged !== 0) {
    await announceLevelChange(ix, u.id, before.name, next.level, next.levelsChanged);
  }

  const embed = new EmbedBuilder()
    .setTitle(t("reward.dm.title", { name: u.displayName }))
    .setDescription(t("reward.dm.description", {
      name: before.name,
      level,
      xp: delta.xp ?? 0,
      gp: fmtGp(delta.cp ?? 0),
      gt: delta.tp ?? 0,
      nextXp: next.xp.toLocaleString(),
      nextLevel: next.level,
      nextGp: fmtGp(next.cp),
      nextGt: next.tp
    }))
    .setFooter({ text: reason ? t("reward.common.footerReason", { reason }) : t("reward.common.footerDash") });

  await ix.reply({embeds: [embed] });
}

export default { data, execute };
