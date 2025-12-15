// src/commands/initiate.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, userMention } from 'discord.js';
import { getDb } from '../db/index.js';
import { t } from '../lib/i18n.js';
import { getPlayer, loadCharCacheFromDB, setActive } from '../utils/db_queries.js';
import { CONFIG } from "../config/resolved.js";
import { showCharacterEmbed } from '../utils/embeds.js';

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

  if (await getPlayer(targetUser.id, rawName)){
    await interaction.reply({ ephemeral: true, content:
      targetUser.id === interaction.user.id
        ? 'You already have an adventurer of that name. Retire before initiating a new one.'
        : 'That user already has an adventurer of that name. Retire before initiating a new one.' });
    return;
  }
  
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

  await setActive(interaction.user.id, rawName)
  showCharacterEmbed(interaction, {
    title: t('initiate.title', { name: rawName }), 
    desc: t('initiate.description', { name: rawName }), 
    footer: t('initiate.footer'),
    content: t('initiate.userGreeting', { name: userMention(targetUser.id) })
  })

  loadCharCacheFromDB();
}
