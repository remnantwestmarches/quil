import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';

import { CONFIG } from '../config/resolved.js';
import { t } from '../lib/i18n.js';

const CFG = CONFIG.guild!.config;

const DM_ROLE_ID = CFG.features?.lfg?.roles?.dmAvailable ;
export const data = new SlashCommandBuilder()
  .setName('dm')
  .setDescription('DM availability controls')
  .addSubcommand(sc => sc
    .setName('toggle')
    .setDescription('Toggle your “Available to DM” status'))
  .addSubcommand(sc => sc
    .setName('list')
    .setDescription('Show who is currently Available to DM'))

// ---- Executor ---- 
export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: t('dm.guildOnly'), ephemeral: true });

  const role = guild.roles.cache.find(r => r.id === DM_ROLE_ID);
  if (!role) {
    return interaction.reply({ content: t('dm.roleMissing', { role: DM_ROLE_ID ?? 'undefined' }), ephemeral: true });
  }

  if (sub === 'list') {
    // Open to everyone (override builder gate)
    const members = role.members.map(m => m.displayName || `<@${m.id}>`);
    const embed = new EmbedBuilder()
      .setColor(0x00bcd4)
      .setTitle('__Available DMs__')
      .setDescription(members.length ? members.join('\n') : t('dm.list.empty'));
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'toggle') {
    // Require staff/GM for toggle — mirrors old permission vibe.
    // If you want looser rules, remove this check.
    const member = await guild.members.fetch(interaction.user.id);
    const canToggle = member.permissions.has(PermissionFlagsBits.KickMembers)
      || member.roles.cache.some(r => ['DM', 'Crew'].includes(r.name));
    if (!canToggle) {
      return interaction.reply({ content: t('dm.toggle.notAllowed'), ephemeral: true });
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return interaction.reply({ content: t('dm.toggle.disabled', { user: interaction.user.toString() }) });
    } else {
      await member.roles.add(role);
      return interaction.reply({ content: t('dm.toggle.enabled', { user: interaction.user.toString() }) });
    }
  }
}
