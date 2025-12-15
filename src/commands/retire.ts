import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageFlags,
} from 'discord.js';
import { getDb } from '../db/index.js';

import { CONFIG } from '../config/resolved.js';
import { t } from '../lib/i18n.js';
import { getPlayer, loadCharCacheFromDB } from '../utils/db_queries.js';

export const data = new SlashCommandBuilder()
  .setName('retire')
  .setDescription('Retire your adventurer or another adventurer (Mod+ only).')
  .addUserOption(o =>
    o.setName('user')
     .setDescription('Target user to retire (Mod+ only).')
     .setRequired(false))
  .addStringOption(o => o.setName('character').setDescription('character to retire').setRequired(false).setAutocomplete(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)


// We’ll register an event listener in execute() for the modal submit.
export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user');
  const char = interaction.options.getString('character');
  const isSelf = !targetUser || targetUser.id === interaction.user.id;

  // Permission check for mod actions
  if (!isSelf) {
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const canManage =
      member?.permissions.has(PermissionFlagsBits.KickMembers) ||
      member?.roles.cache.some(r => Object.values(CONFIG.guild?.config.roles ?? {}).map(role => role.id).includes(r.id));
    if (!canManage) {
      return interaction.reply({
        content: 'Only moderators or staff can retire another adventurer.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Build modal
  const modal = new ModalBuilder()
    .setCustomId(`retire-confirm-${targetUser?.id ?? interaction.user.id}`)
    .setTitle(`Confirm Retirement`);

  const charInput = new TextInputBuilder()
    .setCustomId('char_name')
    .setLabel('Character Name (leave blank for active char)')
    .setValue(char ?? '')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const confirmInput = new TextInputBuilder()
    .setCustomId('confirm_text')
    .setLabel(t('retire.confirmLabel'))
    .setPlaceholder('RETIRE')
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(charInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(confirmInput);
  modal.addComponents(row1,row2);

  await interaction.showModal(modal);
}

// --- Modal Handler ---
export async function handleModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('retire-confirm-')) return;
  const char = interaction.fields.getTextInputValue('char_name');
  const input = interaction.fields.getTextInputValue('confirm_text');
  if (input !== 'RETIRE') {
    return interaction.reply({ content: t('retire.cancelled'), flags: MessageFlags.Ephemeral });
  }

  const targetId = interaction.customId.replace('retire-confirm-', '');
  const actor = interaction.user;

  const db = await getDb();

  let row = null;
  let query = `FROM charlog WHERE userId = ${targetId}`
  if (char) { query += ` AND name = '${char}'` }
  else { query += " AND active = true" }
  row = await getPlayer(targetId, char)

  if (!row) {
    return interaction.reply({
      content: t('retire.noAdventurer', { name: `<@${targetId}>` }),
      flags: MessageFlags.Ephemeral,
    });
  }

  await db.run(`DELETE ${query}`);

  let lastChar = false
  const activeCharLeft = await db.get(`SELECT * FROM charlog WHERE userId = ? AND active = 1`, targetId);
  if (!activeCharLeft) {
    const anyCharLeft = await db.get(`SELECT * FROM charlog WHERE userId = ?`, targetId);
    if (anyCharLeft) {
      await db.run(`UPDATE charlog
                    SET active = 1
                    WHERE rowid = (
                        SELECT rowid
                        FROM charlog
                        WHERE userId = ?
                        ORDER BY rowid ASC
                        LIMIT 1
                    );`, targetId)
    }
    else {
      lastChar = true
    }
  }
  // Optional role cleanup
  if (lastChar) {
    const guild = interaction.guild;
    if (guild) {
      const member = await guild.members.fetch(targetId).catch(() => null);
      if (member) {
        const gmRole = guild.roles.cache.find(r => r.name === 'Guild Member');
        const uninit = guild.roles.cache.find(r => r.name === 'uninitiated');
        if (gmRole && member.roles.cache.has(gmRole.id)) await member.roles.remove(gmRole).catch(() => {});
        if (uninit && !member.roles.cache.has(uninit.id)) await member.roles.add(uninit).catch(() => {});
      }
    }
  }

  const targetMention = `<@${targetId}>`;
  const selfAction = actor.id === targetId;
  const note = selfAction ? '' : ` (retired by ${actor})`;

  await interaction.reply({
    content: t('retire.userNotice', { name: targetMention }) + note,
    embeds: [{
        title: t('retire.title', { name: row.name ?? 'Unknown' }) ,
        description: t('retire.description', { name: row.name ?? 'Unknown' }),
        fields: [
            { name: '⬆️ Level', value: row.level?.toString() ?? 'N/A', inline: true },
            { name: '💪 XP', value: row.xp?.toString() ?? 'N/A', inline: true },
            { name: '💰 GP', value: row.cp !== undefined ? (row.cp / 100).toFixed(2) : 'N/A', inline: true },
            { name: '🎫 GP', value: row.tp?.toString() ?? 'N/A', inline: true },
        ],
        footer: { text: t('retire.footer') },
        color: 0xFF0000,
    }]
  });
  
  loadCharCacheFromDB();
}