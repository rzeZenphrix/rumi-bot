const respond = require('../../utils/respond');
const { requireServerTier } = require('../../systems/monetization/access');
const {
  captureGuildSnapshot,
  listSnapshots,
  getSnapshotById,
  createRestorePreview,
  applyRestoreJob,
  getVersionControlConfig,
  setVersionControlConfig
} = require('../../systems/serverdata/backups');

module.exports = {
  name: 'versioncontrol',
  aliases: ['vcserver'],
  category: 'server',
  description: 'Owner-only structural snapshots and rollback for premium servers.',
  usage: 'versioncontrol <on|off|status|list|preview|restore|confirm|snapshot> [id|token]',
  examples: ['versioncontrol on', 'versioncontrol list', 'versioncontrol restore <snapshot-id>', 'versioncontrol confirm <token>'],
  guildOnly: true,
  subcommands: [
    {
      name: 'snapshot',
      description: 'Capture a fresh baseline snapshot immediately.',
      usage: 'versioncontrol snapshot',
      examples: ['versioncontrol snapshot']
    }
  ],

  async execute({ message, args }) {
    if (message.author.id !== message.guild.ownerId) {
      return respond.reply(message, 'bad', 'Only the server owner can use that command.');
    }

    const premium = await requireServerTier(message, 'tier1', 'Version control');
    if (!premium) return null;

    const action = String(args.shift() || 'status').toLowerCase();
    if (action === 'status' || action === 'view') {
      const config = await getVersionControlConfig(message.guild.id);
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Version control',
        mentionUser: false,
        description: config.enabled
          ? 'Enabled. Structural changes are being snapshotted for rollback.'
          : 'Disabled. Enable it to begin storing rollback snapshots.'
      });
    }

    if (action === 'on' || action === 'enable') {
      await setVersionControlConfig(message.guild.id, {
        enabled: true,
        enabledBy: message.author.id,
        lastBaselineAt: new Date().toISOString()
      });
      await captureGuildSnapshot(message.guild, {
        kind: 'version_control',
        reason: 'Version control baseline',
        createdBy: message.author.id,
        includesMembers: false
      }).catch(() => null);
      return respond.reply(message, 'good', 'Version control is now enabled.');
    }

    if (action === 'off' || action === 'disable') {
      await setVersionControlConfig(message.guild.id, {
        enabled: false,
        disabledBy: message.author.id
      });
      return respond.reply(message, 'good', 'Version control is now disabled.');
    }

    if (action === 'list') {
      const snapshots = await listSnapshots(message.guild.id, 'version_control', 10).catch(() => []);
      const description = snapshots.length
        ? snapshots.map((entry, index) => `**${index + 1}.** \`${entry.id}\`\n<t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:F>`).join('\n\n')
        : 'No version-control snapshots are stored yet.';
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Version snapshots',
        mentionUser: false,
        description
      });
    }

    if (action === 'snapshot') {
      const snapshot = await captureGuildSnapshot(message.guild, {
        kind: 'version_control',
        reason: 'Manual version snapshot',
        createdBy: message.author.id,
        includesMembers: false
      });
      return respond.reply(message, 'good', `Saved version snapshot \`${snapshot.id}\`.`);
    }

    const target = String(args.shift() || '').trim();
    if (!target) {
      return respond.reply(message, 'info', 'Use `versioncontrol <preview|restore|confirm> <snapshot-id|token>`.', {
        mentionUser: false
      });
    }

    if (action === 'preview') {
      const snapshot = await getSnapshotById(message.guild.id, target);
      if (!snapshot) return respond.reply(message, 'bad', 'That version snapshot could not be found.');
      const result = await createRestorePreview(message.guild, snapshot, message.author.id);
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Version restore preview',
        mentionUser: false,
        description: [
          `Snapshot: \`${snapshot.id}\``,
          `Missing roles: **${result.preview.missingRoles}**`,
          `Missing channels: **${result.preview.missingChannels}**`,
          `Changed roles: **${result.preview.changedRoles}**`,
          `Changed channels: **${result.preview.changedChannels}**`,
          '',
          `Confirm token: \`${result.token}\``,
          'Use `versioncontrol confirm <token>` to apply it.'
        ].join('\n')
      });
    }

    if (action === 'restore') {
      const snapshot = await getSnapshotById(message.guild.id, target);
      if (!snapshot) return respond.reply(message, 'bad', 'That version snapshot could not be found.');
      const result = await createRestorePreview(message.guild, snapshot, message.author.id);
      return respond.reply(message, 'alert', null, {
        allowTitle: true,
        title: 'Rollback ready',
        mentionUser: false,
        description: [
          `Snapshot: \`${snapshot.id}\``,
          `Confirm token: \`${result.token}\``,
          'Run `versioncontrol confirm <token>` if you want to apply the rollback.'
        ].join('\n')
      });
    }

    if (action === 'confirm') {
      const result = await applyRestoreJob(message.guild, target);
      return respond.reply(message, 'good', null, {
        allowTitle: true,
        title: 'Rollback applied',
        mentionUser: false,
        description: [
          `Roles created: **${result.result.rolesCreated}**`,
          `Roles updated: **${result.result.rolesUpdated}**`,
          `Channels created: **${result.result.channelsCreated}**`,
          `Channels updated: **${result.result.channelsUpdated}**`
        ].join('\n')
      });
    }

    return respond.reply(message, 'info', 'Use `versioncontrol <on|off|status|list|preview|restore|confirm|snapshot>`.', {
      mentionUser: false
    });
  }
};
