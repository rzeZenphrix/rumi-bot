const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const { captureGuildSnapshot, listSnapshots, getSnapshotById, createRestorePreview, applyRestoreJob } = require('../../systems/serverdata/backups');

function formatRelativeDays(milliseconds) {
  const days = Math.ceil(milliseconds / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? '' : 's'}`;
}

module.exports = {
  name: 'serverbackup',
  aliases: ['backupserver'],
  category: 'server',
  description: 'Store and restore full server backups with a preview-first restore flow.',
  usage: 'serverbackup <create|list|preview|restore|confirm> [id|token]',
  examples: ['serverbackup create', 'serverbackup list', 'serverbackup restore <snapshot-id>', 'serverbackup confirm <token>'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const action = String(args.shift() || 'list').toLowerCase();
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const cooldownMs = access?.hasServerPremiumBase ? 14 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    if (action === 'create') {
      const latest = (await listSnapshots(message.guild.id, 'manual_backup', 1).catch(() => []))[0];
      if (latest) {
        const ageMs = Date.now() - new Date(latest.created_at).getTime();
        if (ageMs < cooldownMs) {
          return respond.reply(
            message,
            'bad',
            `You can create the next backup in about ${formatRelativeDays(cooldownMs - ageMs)}.`
          );
        }
      }

      const snapshot = await captureGuildSnapshot(message.guild, {
        kind: 'manual_backup',
        reason: 'Manual server backup',
        createdBy: message.author.id,
        includesMembers: true
      });

      return respond.reply(message, 'good', null, {
        allowTitle: true,
        title: 'Backup saved',
        mentionUser: false,
        description: `Saved backup \`${snapshot.id}\` with member roles and bot data.`
      });
    }

    if (action === 'list' || action === 'view') {
      const snapshots = await listSnapshots(message.guild.id, 'manual_backup', 10).catch(() => []);
      const description = snapshots.length
        ? snapshots.map((entry, index) => `**${index + 1}.** \`${entry.id}\`\n<t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:F>`).join('\n\n')
        : 'No server backups are stored yet.';
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Server backups',
        mentionUser: false,
        description
      });
    }

    const target = String(args.shift() || '').trim();
    if (!target) {
      return respond.reply(message, 'info', 'Use `serverbackup <preview|restore|confirm> <snapshot-id|token>`.', {
        mentionUser: false
      });
    }

    if (action === 'preview') {
      const snapshot = await getSnapshotById(message.guild.id, target);
      if (!snapshot) return respond.reply(message, 'bad', 'That backup could not be found.');
      const result = await createRestorePreview(message.guild, snapshot, message.author.id);
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Backup restore preview',
        mentionUser: false,
        description: [
          `Snapshot: \`${snapshot.id}\``,
          `Missing roles: **${result.preview.missingRoles}**`,
          `Missing channels: **${result.preview.missingChannels}**`,
          `Changed roles: **${result.preview.changedRoles}**`,
          `Changed channels: **${result.preview.changedChannels}**`,
          '',
          `Confirm token: \`${result.token}\``,
          'Use `serverbackup confirm <token>` if you want to apply it.'
        ].join('\n')
      });
    }

    if (action === 'restore') {
      const snapshot = await getSnapshotById(message.guild.id, target);
      if (!snapshot) return respond.reply(message, 'bad', 'That backup could not be found.');
      const result = await createRestorePreview(message.guild, snapshot, message.author.id);
      return respond.reply(message, 'alert', null, {
        allowTitle: true,
        title: 'Restore ready',
        mentionUser: false,
        description: [
          `Snapshot: \`${snapshot.id}\``,
          `Roles to create: **${result.preview.missingRoles}**`,
          `Channels to create: **${result.preview.missingChannels}**`,
          '',
          `Confirm token: \`${result.token}\``,
          'Run `serverbackup confirm <token>` to apply the restore.'
        ].join('\n')
      });
    }

    if (action === 'confirm') {
      const result = await applyRestoreJob(message.guild, target);
      return respond.reply(message, 'good', null, {
        allowTitle: true,
        title: 'Backup restored',
        mentionUser: false,
        description: [
          `Roles created: **${result.result.rolesCreated}**`,
          `Roles updated: **${result.result.rolesUpdated}**`,
          `Channels created: **${result.result.channelsCreated}**`,
          `Channels updated: **${result.result.channelsUpdated}**`
        ].join('\n')
      });
    }

    return respond.reply(message, 'info', 'Use `serverbackup <create|list|preview|restore|confirm>`.', {
      mentionUser: false
    });
  }
};
