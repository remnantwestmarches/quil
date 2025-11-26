// src/commands/initiate.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  userMention,
} from 'discord.js';
import { getDb } from '../db/index.js';
import { t } from '../lib/i18n.js';
import { getPlayer } from '../utils/db_queries.js';
import { CONFIG } from "../config/resolved.js";

export const data = new SlashCommandBuilder()
  .setName('initiate')
  .setDescription('Create an adventurer record for a user')
  .addUserOption(o =>
    o.setName('user').setDescription('Discord user to initiate (defaults to you)').setRequired(true))
  .addStringOption(o =>
    o.setName('name').setDescription("Adventurer's name").setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers) // mod+
    
export async function execute(interaction: ChatInputCommandInteraction) {

  // --- inputs ---
  const db = getDb();
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const rawName = interaction.options.getString('name', true).trim();

  // name validation (letters/numbers/spaces/apostrophes/hyphens)
  if (!/^[a-zA-Z0-9'\- ]+$/.test(rawName)) {
    await interaction.reply({ ephemeral: true, content:
      'Invalid character name. Use letters, numbers, spaces, apostrophes, or hyphens.' });
    return;
  }

  const duplicate = await getPlayer(targetUser.id, rawName)

  if (duplicate){
    await interaction.reply({ ephemeral: true, content:
      targetUser.id === interaction.user.id
        ? 'You already have an adventurer of that name. Retire before initiating a new one.'
        : 'That user already has an adventurer of that name. Retire before initiating a new one.' });
    return;
  }

  await db.get(
    `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
    targetUser.id,
    rawName
  );
  
  const CFG = CONFIG.guild!.config;
  const DTP_RATE = CFG.features.dtp?.rate || 1;
  const timestamp = Math.round(new Date().getTime() / 1000)
  const timestampNormal = timestamp - (timestamp % Math.round(86400 / DTP_RATE))

  // --- create baseline record (Level 3 / 900 XP / 80 GP / 0 TP) ---
  await db.run(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active, dtp, dtp_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId,name) DO NOTHING`,
    [targetUser.id, rawName, 3, 900, 8000, 0, true, 0, timestampNormal]
  );

  // reply (no role changes, no fund debit)
  await interaction.reply({
    content: t('initiate.userGreeting', { name: userMention(targetUser.id) }),
    embeds: [{
      title: t('initiate.title', { name: rawName }),
      author: { name: targetUser.displayName, icon_url: targetUser.displayAvatarURL() },
      description: t('initiate.description', { name: rawName }),
      fields: [
        { name: '⬆️ Level', value: '3', inline: true },
        { name: '💪 XP',    value: '900', inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: '💰 GP',    value: '80.00', inline: true },
        { name: '🎫 GT',    value: '0', inline: true },
        { name: '🔨 DTP',    value: '0', inline: true },
      ],
      footer: { 
        text: t('initiate.footer'), 
        ...(interaction.client.user?.displayAvatarURL() ? { icon_url: interaction.client.user.displayAvatarURL() } : {})
      },
      color: 0x00AAFF,}],
  });
}
