import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  GuildMember,
  userMention,
  AutocompleteInteraction,
  SlashCommandSubcommandBuilder,
  type APIEmbedField,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import { validateCommandPermissions } from "../config/validaters.js";
import { adjustResource, getPlayer, getPlayerCC } from "../utils/db_queries.js";
import { updateDTP } from "../domain/resource.js";
import { showCharacterEmbed } from "../utils/embeds.js";
import { announceLevelChange, bandFor, levelForXP, proficiencyFor } from "../domain/xp.js";

const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;
const PERMS = {
  add: [ROLE.dm.id, ROLE.moderator.id, ROLE.admin.id, ROLE.keeper.id].filter(Boolean) as string[],
  adjust: [ROLE.moderator.id, ROLE.admin.id, ROLE.keeper.id].filter(Boolean) as string[],
  set: [ROLE.admin.id].filter(Boolean) as string[],
  show: [] as string[],
};
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const RESOURCE_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const toCp = (gp: number) => Math.round(gp * 100);
const toGp = (cp: number) => (cp / 100).toFixed(2);
const resourceMapping: { [id: string]: [string, string]; } = {"cp":["GP","💰"], "tp":["GT","🎫"], "dtp":["DTP","🔨"], "cc":["CC","🪙"], "xp":["XP","💪"]}

function addSharedOptions(
    sub: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
    return sub
      .addStringOption((o) => o
        .setName("type")
        .setDescription("Which resource should be shown? (Default: GP)")
        .setRequired(true)
        .addChoices(
            { name: "GP (Gold Pieces)", value: "cp" },
            { name: "XP (Experience Points)", value: "xp" },
            { name: "GT (Golden Tickets)", value: "tp" },
            { name: "DTP (Downtime Points)", value: "dtp" },
            { name: "CC (Crew Coins)", value: "cc" }))
      .addUserOption((o) => o
        .setName("user")
        .setDescription("Target")
        .setRequired(false))
      .addStringOption(o => o
        .setName('name')
        .setDescription("Adventurer's name")
        .setRequired(false)
        .setAutocomplete(true))
      .addStringOption((o) => o
        .setName("reason")
        .setDescription("Why? (audit)")
        .setMaxLength(200))
}

export const data = new SlashCommandBuilder()
  .setName("resource")
  .setDescription("Manage a user's resources (GP / XP / GT / DTP).")
  .addSubcommand((sc) =>
    addSharedOptions(sc
      .setName("show")
      .setDescription("Show resource for a user")
  ))
  .addSubcommand((sc) =>
    addSharedOptions(sc
      .setName("add")
      .setDescription("Add to a character's resource (positive number)")
      .addIntegerOption((o) => o
        .setName("amount")
        .setDescription("amount to add (e.g., 5)")
        .setRequired(true)
        .setMinValue(0))
  ))
  .addSubcommand((sc) =>
    addSharedOptions(sc
      .setName("adjust")
      .setDescription("Adjust resource by a positive or negative number")
      .addIntegerOption((o) => o
        .setName("amount")
        .setDescription("Signed resource delta (e.g., -3)")
        .setRequired(true))
  ))
  .addSubcommand((sc) =>
    addSharedOptions(sc
      .setName("set")
      .setDescription("Set a user's resource to an exact value")
      .addIntegerOption((o) => o
        .setName("amount")
        .setDescription("Absolute resource (>=0)")
        .setRequired(true)
        .setMinValue(0))
  ));

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand();
  const member = ix.member as GuildMember | null;
  
  // Permission guard
  if (!validateCommandPermissions(ix, member, PERMS)) {
    return; 
  }
  
  const resource = ix.options.getString("type") ?? "cp";
  const amt = ix.options.getInteger("amount") ?? 0;
  const user = ix.options.getUser("user") ?? ix.user;
  const char = ix.options.getString("name") ?? "";
  const reason = ix.options.getString("reason");

  let isInAllowedChannel = ix.channelId === RESOURCE_CHANNEL_ID;
  const isInConfiguredGuild = ix.guildId === CONFIG.guild?.id;
  if (resource === "dtp") {isInAllowedChannel = isInAllowedChannel || ix.channelId === DTP_CHANNEL_ID}

  if (!isInAllowedChannel && isInConfiguredGuild && sub === "show") {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('sell.notInResourceChannel'),
    });
    return;
  }

  if (resource === "dtp"){
    if (await updateDTP(user.id, char) == null) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t('dtp.errors.notInSystem', { username: user.username }),
      });
    }
  }
  
  const row = await getPlayer(user.id, char);
  if (!row) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t('dtp.errors.notInSystem', { username: user.displayName }),
    });
  }

  let res = row.cp
  if (resource === "tp") { res = row.tp }
  else if (resource === "dtp") { res = row.dtp }
  else if (resource === "xp") { res = row.xp }
  else if (resource === "cc") { res = await getPlayerCC(user.id) }

  if (sub === "show") {
    let fields: APIEmbedField[] = []
    if (resource === "xp"){
      const level = levelForXP(row.xp);
      const { curr, next } = bandFor(level);
      const nextDisp = next === null ? "—" : `${next.toLocaleString()} XP (to L${level + 1})`;
      const pct = next === null ? 100 : Math.floor(((row.xp - curr) / (next - curr)) * 100);
      const pctStr = next === null
        ? t("xp.show.fields.max")
        : t("xp.show.progressFmt", { pct, curr: (row.xp - curr).toLocaleString(), range: (next - curr).toLocaleString() });
      fields =  [
        { name: t("xp.show.fields.level"), value: `**${level}**`, inline: true },
        { name: t("xp.show.fields.xp"),    value: row.xp.toLocaleString(), inline: true },
        { name: t("xp.show.fields.prof"),  value: `+${proficiencyFor(level)}`, inline: true },
        { name: t("xp.show.fields.next"),  value: nextDisp, inline: false },
        { name: t("xp.show.fields.progress"), value: pctStr, inline: false }
      ]
    }
    else { 
      fields = [{ name: `${resourceMapping[resource]?.[1]} ${resourceMapping[resource]?.[0]}`, value: `**${resource === "cp" ? toGp(res) : res}**`, inline: false }]
    } 
    showCharacterEmbed(ix, {
      title: `${row.name} — Resource Overview`,
      fields: fields,
      footer: reason ? `Reason: ${reason}` : t('initiate.footer')
    })
    return;
  }

  let set = false
  if (sub === "set") { set = true }

  const next = await adjustResource(user.id, [resource], [resource === "cp" ? toCp(amt) : amt], set, row.name);
  if (next){
    let resNew = next.cp
    if (resource === "tp") { resNew = next.tp }
    else if (resource === "dtp") { resNew = next.dtp }
    else if (resource === "xp") { 
      resNew = next.xp
      const levelNew = levelForXP(next.xp);
      const changed = levelNew - row.level;
      if (changed !== 0) {
        await adjustResource(user.id, ["level"], [levelNew], true, next.name);
        await announceLevelChange(ix, next.name, levelNew, changed, proficiencyFor(levelNew));
      }
      //level up stuff
    }
    else if (resource === "cc") { resNew = await getPlayerCC(user.id) }
    showCharacterEmbed(ix, {
      title: `${next.name} — Resource Adjusted`,
      fields: [
        { 
          name: `${resourceMapping[resource]?.[1]} ${resourceMapping[resource]?.[0]}`, 
          value: t(`resource.${sub}.ok`, { 
            mention: userMention(user.id), 
            name: next.name, 
            amt: amt,
            resource: resourceMapping[resource]?.[0] ?? "",
            newAmt: `${resource === "cp" ? toGp(resNew) : resNew}`,
            oldAmt: res,
            icon: resourceMapping[resource]?.[1] ?? "",
            sign: amt >= 0 ? "+" : "",
          }), 
          inline: false }
        ],
      footer: reason ? `Reason: ${reason}` : t('initiate.footer')
    })
  }
}

export default { data, execute };