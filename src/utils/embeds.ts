import { EmbedBuilder, ChatInputCommandInteraction, MessageFlags, type APIEmbedField, User, type Interaction, type InteractionReplyOptions } from "discord.js";
import { getPlayer } from "./db_queries.js";
import { t } from "../lib/i18n.js";
import type { PlayerRow } from "./db_queries.js";
import { updateDTP } from "../domain/resource.js";

type embedInfo = {
  caller: User;
  info?: PlayerRow[];
};
type UserOptionName = `user${number}`;
type CharacterOptionName = `char${number}`

interface embedOptions{
  title?: string,
  desc?: string,
  footer?: string,
  content?: string,
  fields?: APIEmbedField[]
}

async function collectUsers(ix: ChatInputCommandInteraction, multi: boolean, max = 10): Promise<PlayerRow[]> {
  const users: PlayerRow[] = [];
  if (multi) {
    for (let i = 1; i <= max; i++) {
        const u = ix.options.getUser(`user${i}` as UserOptionName);
        const c = ix.options.getString(`char${i}` as CharacterOptionName) ?? undefined;
        if (u) {
            const row = await getPlayer(u.id,c)
            if (row) users.push(row);
        }
    }
  }
  else {
    const user = ix.options.getUser("user") ?? ix.user;
    const char = ix.options.getString("character") ?? "";
    const row = await getPlayer(user.id, char)
    if (row) users.push(row);
  }
  return users;
}

async function getEmbedInfo(interaction: ChatInputCommandInteraction, multi: boolean = false): Promise<embedInfo> {
    const caller = interaction.user;
    let embedInfo: embedInfo = {caller}
    embedInfo.info = await collectUsers(interaction, multi)

    if (!embedInfo.info) {
        await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: t('common.noActiveChar', { user: caller.toString() }),
        });
        return embedInfo;
    }
    for (const row of embedInfo.info){
      row.dtp = await updateDTP(row.userId, row.name) ?? 0
    }
    return embedInfo;
}

export async function showCharacterEmbed(interaction: ChatInputCommandInteraction, opts: embedOptions = {} ){
    const embedInfo = await getEmbedInfo(interaction)
    if (embedInfo.info?.at(0)){
      const title = opts.title ?? `Character - ${embedInfo.info.at(0)?.name}`
      const desc = opts.desc ?? null
      const footer = opts.footer ?? "Requested via " + embedInfo.caller.displayName
      const cp = embedInfo.info.at(0)?.cp ?? 0
      const gp = (cp/100).toFixed(2)
      const fields = opts.fields ?? [
        { name: 'Level', value: "⭐ " + String(embedInfo.info.at(0)?.level), inline: true },
        { name: 'Experience (XP)', value:"💪 " + String(embedInfo.info.at(0)?.xp), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: 'Gold Pieces (GP)', value: "💰 " + gp, inline: true },
        { name: 'Golden Tickets (GT)', value: "🎫 " + embedInfo.info.at(0)?.tp, inline: true },
        { name: 'Downtime (DTP)', value: "🔨 " + embedInfo.info.at(0)?.dtp, inline: true },
      ]
      const reply: InteractionReplyOptions = {
        embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff) // set to brand color
          .setAuthor({name: embedInfo.caller.displayName, iconURL:embedInfo.caller.displayAvatarURL()})
          .setTitle(`${title}`)
          .setDescription(desc)
          .addFields(fields)
          .setFooter({ text: footer })
    ]}
    if (opts.content){
      reply.content = opts.content
    }
    await interaction.reply(reply)
  }
  else{
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: t('gp.errors.notInSystem', { username: embedInfo.caller.username ?? "" }),
    });
  }
}

export async function buildMultiEmbed(interaction: ChatInputCommandInteraction){
    await interaction.reply({embeds: [
      new EmbedBuilder()
        .setColor(0x0099ff) // set to brand color
        .setThumbnail(user.displayAvatarURL())
        .setTitle(`Character — ${row.name}`)
        .setDescription("OOC Owner: " + user.toString())
        .addFields(
          { name: 'Level', value: "⭐ " + String(row.level), inline: true },
          { name: 'Experience (XP)', value:"💪 " + String(row.xp), inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
          { name: 'Gold Pieces (GP)', value: "💰 " + gp, inline: true },
          { name: 'Golden Tickets (GT)', value: "🎫 " + tp, inline: true },
          { name: 'Downtime (DTP)', value: "🔨 " + dtp, inline: true },
        )
        .setFooter({ text: "Requested via " + caller.displayName, iconURL: caller.displayAvatarURL() })
  ]});
}