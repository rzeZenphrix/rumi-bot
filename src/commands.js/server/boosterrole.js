const { PermissionFlagsBits, resolveColor } = require('discord.js');
const respond = require('../../utils/respond');
const { findMember } = require('../../utils/memberResolver');
const { findRole } = require('../../utils/roleResolver');
const {
  memberIsBooster,
  guildSupportsRoleIcons,
  rawIconTextLooksNsfw,
  getBoosterRoleSettings,
  updateBoosterRoleSettings,
  listBoosterRoles,
  getManagedBoosterRole,
  listBoosterRoleShares,
  repositionBoosterRoles,
  createBoosterRole,
  renameBoosterRole,
  setBoosterRoleColors,
  setBoosterRoleIcon,
  shareBoosterRole,
  unshareBoosterRole,
  cleanupBoosterRoles
} = require('../../systems/boosterroles/store');
const { requireServerPremium } = require('../../systems/monetization/access');

function isAdmin(message) {
  return message.author.id === message.guild.ownerId ||
    message.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    message.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function parseOnOff(input) {
  const value = String(input || '').toLowerCase();
  if (['on', 'enable', 'enabled', 'true', 'yes'].includes(value)) return true;
  if (['off', 'disable', 'disabled', 'false', 'no'].includes(value)) return false;
  return null;
}

function parseColorValues(args) {
  const joined = args.join(' ').trim();
  if (!joined) return { primary: null, secondary: null };

  const split = joined.includes(',')
    ? joined.split(',').map((entry) => entry.trim()).filter(Boolean)
    : args.filter(Boolean);

  try {
    const primary = resolveColor(split[0]);
    const secondary = split[1] ? resolveColor(split[1]) : null;
    return { primary, secondary };
  } catch {
    return { primary: null, secondary: null };
  }
}

function describeShares(guild, record, shares) {
  const roleMention = guild.roles.cache.get(record.role_id)?.toString?.() || `\`${record.role_id}\``;
  const owner = guild.members.cache.get(record.owner_user_id);
  const roleShares = shares.filter((entry) => entry.owned_role_id === record.id);
  return [
    `${roleMention} - owner: **${owner?.displayName || record.owner_user_id}**`,
    `Shares: **${roleShares.length}**`
  ].join('\n');
}

async function resolveTwoRoles(message, args) {
  const mentioned = [...message.mentions.roles.values()];
  if (mentioned.length >= 2) {
    return {
      topRole: mentioned[0],
      bottomRole: mentioned[1]
    };
  }

  const topInput = args.shift() || '';
  const bottomInput = args.join(' ');
  return {
    topRole: await findRole(message.guild, topInput),
    bottomRole: await findRole(message.guild, bottomInput)
  };
}

module.exports = {
  name: 'boosterrole',
  aliases: ['boostrole', 'customboosterrole'],
  category: 'server',
  description: 'Manage booster-owned custom roles, sharing, filters, and server settings.',
  usage: 'boosterrole <create|rename|color|icon|share|limit|hoist|cleanup|filter|regex filter|filtericon nsfw|filters> ...',
  examples: [
    'boosterrole create Moonlight',
    'boosterrole color #ff99cc, #ffd8f0',
    'boosterrole share @friend',
    'boosterrole filter add admin',
    'boosterrole cleanup auto on'
  ],
  guildOnly: true,
  botPermissions: [PermissionFlagsBits.ManageRoles],
  subcommands: [
    { name: 'create', description: 'Create your booster role.', usage: 'boosterrole create <name>', examples: ['boosterrole create Moonlight'] },
    { name: 'rename', description: 'Rename your booster role.', usage: 'boosterrole rename <name>', examples: ['boosterrole rename Pink Dawn'] },
    { name: 'color', description: 'Set one color or a two-color gradient for your booster role.', usage: 'boosterrole color <primary> [, secondary]', examples: ['boosterrole color #ff88cc, #ffddee'] },
    { name: 'share', description: 'Share your booster role with another member.', usage: 'boosterrole share <member>', examples: ['boosterrole share @friend'] },
    { name: 'cleanup', description: 'Clean up stale booster roles and shares.', usage: 'boosterrole cleanup [auto <on|off>]', examples: ['boosterrole cleanup', 'boosterrole cleanup auto on'] }
  ],

  async execute({ client, message, args }) {
    const sub = String(args.shift() || 'view').toLowerCase();
    const settings = await getBoosterRoleSettings(message.guild.id).catch(() => null);

    if (!settings) {
      return respond.reply(message, 'bad', 'Booster role storage is unavailable right now.');
    }

    if (sub === 'view' || sub === 'status') {
      const managed = await getManagedBoosterRole(message.guild, message.author.id).catch(() => ({ record: null, role: null }));
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Booster role',
        mentionUser: false,
        description: managed.role
          ? [
              `Role: ${managed.role}`,
              `Share limit: **${settings.share_limit == null ? 'none' : settings.share_limit}**`,
              `Creation enabled: **${settings.creation_enabled ? 'yes' : 'no'}**`
            ].join('\n')
          : 'You do not have a booster role on this server yet.'
      });
    }

    if (sub === 'create') {
      if (!memberIsBooster(message.member)) {
        return respond.reply(message, 'bad', 'You need to be actively boosting this server to create a booster role.');
      }

      const name = args.join(' ').trim();
      if (!name) {
        return respond.reply(message, 'info', 'Use `boosterrole create <name>`.', { mentionUser: false });
      }

      const result = await createBoosterRole(message.guild, message.member, name, message.author.id);
      return respond.reply(message, 'good', `Created your booster role ${result.role}.`, { mentionUser: false });
    }

    if (sub === 'rename') {
      if (!memberIsBooster(message.member)) {
        return respond.reply(message, 'bad', 'You need to be actively boosting this server to rename your booster role.');
      }

      const managed = await getManagedBoosterRole(message.guild, message.author.id).catch(() => ({ record: null, role: null }));
      if (!managed.record || !managed.role) {
        return respond.reply(message, 'bad', 'You do not have a booster role to rename yet.');
      }

      const nextName = args.join(' ').trim();
      if (!nextName) {
        return respond.reply(message, 'info', 'Use `boosterrole rename <name>`.', { mentionUser: false });
      }

      const result = await renameBoosterRole(message.guild, managed.record, managed.role, nextName, message.author.id);
      return respond.reply(message, 'good', `Renamed your booster role to **${result.role.name}**.`, { mentionUser: false });
    }

    if (sub === 'color') {
      if (!memberIsBooster(message.member)) {
        return respond.reply(message, 'bad', 'You need to be actively boosting this server to recolor your booster role.');
      }

      const managed = await getManagedBoosterRole(message.guild, message.author.id).catch(() => ({ record: null, role: null }));
      if (!managed.record || !managed.role) {
        return respond.reply(message, 'bad', 'You do not have a booster role to recolor yet.');
      }

      const colors = parseColorValues(args);
      if (colors.primary == null) {
        return respond.reply(message, 'info', 'Use `boosterrole color <primary> [, secondary]`.', { mentionUser: false });
      }

      try {
        const result = await setBoosterRoleColors(
          managed.record,
          managed.role,
          colors.primary,
          colors.secondary,
          message.author.id
        );
        return respond.reply(
          message,
          'good',
          colors.secondary == null
            ? `Updated ${result.role} to a single color.`
            : `Updated ${result.role} to a gradient.`
        );
      } catch (error) {
        if (error.code === 'GRADIENT_UNAVAILABLE') {
          return respond.reply(message, 'bad', 'That server does not support gradient role colors here yet.');
        }
        throw error;
      }
    }

    if (sub === 'icon') {
      if (!memberIsBooster(message.member)) {
        return respond.reply(message, 'bad', 'You need to be actively boosting this server to update your booster role icon.');
      }

      const managed = await getManagedBoosterRole(message.guild, message.author.id).catch(() => ({ record: null, role: null }));
      if (!managed.record || !managed.role) {
        return respond.reply(message, 'bad', 'You do not have a booster role to edit yet.');
      }

      if (!guildSupportsRoleIcons(message.guild)) {
        return respond.reply(message, 'bad', 'This server needs boost level 2 before role icons are available.');
      }

      const input = args.join(' ').trim();
      if (settings.icon_nsfw_filter && rawIconTextLooksNsfw(input || message.attachments.first()?.name || '')) {
        await message.delete().catch(() => null);
        return respond.reply(message, 'bad', 'That icon input matched the NSFW icon filter.');
      }

      const result = await setBoosterRoleIcon(message.guild, client, message, managed.record, managed.role, input, message.author.id);
      return respond.reply(
        message,
        'good',
        result.payload.mode === 'clear'
          ? `Cleared the icon for ${result.role}.`
          : `Updated the icon for ${result.role}.`
      );
    }

    if (sub === 'share') {
      const nested = String(args[0] || '').toLowerCase();
      if (nested === 'limit') {
        if (!isAdmin(message)) {
          return respond.reply(message, 'bad', 'You need Manage Roles to set the share limit.');
        }

        args.shift();
        const value = String(args.shift() || '').toLowerCase();
        let shareLimit = settings.share_limit;
        if (value === 'none') shareLimit = null;
        else if (/^\d+$/.test(value)) shareLimit = Number(value);
        else return respond.reply(message, 'info', 'Use `boosterrole share limit <count|none>`.', { mentionUser: false });

        await updateBoosterRoleSettings(message.guild.id, {
          share_limit: shareLimit,
          updated_by: message.author.id
        }, message.author.id);
        return respond.reply(
          message,
          'good',
          shareLimit == null
            ? 'Booster-role sharing is now unlimited.'
            : `Booster-role sharing is now capped at ${shareLimit} member(s).`
        );
      }

      if (nested === 'list') {
        if (!isAdmin(message)) {
          return respond.reply(message, 'bad', 'You need Manage Roles to list every booster role owner.');
        }

        const records = await listBoosterRoles(message.guild.id).catch(() => []);
        const shares = await listBoosterRoleShares(message.guild.id).catch(() => []);
        const description = records.length
          ? records.map((record) => describeShares(message.guild, record, shares)).join('\n\n').slice(0, 4096)
          : 'No booster roles are stored yet.';
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Booster role shares',
          mentionUser: false,
          description
        });
      }

      if (!memberIsBooster(message.member)) {
        return respond.reply(message, 'bad', 'You need to be actively boosting this server to share your booster role.');
      }

      const managed = await getManagedBoosterRole(message.guild, message.author.id).catch(() => ({ record: null, role: null }));
      if (!managed.record || !managed.role) {
        return respond.reply(message, 'bad', 'Create your booster role before sharing it.');
      }

      const shares = await listBoosterRoleShares(message.guild.id, managed.record.id).catch(() => []);
      if (settings.share_limit != null && shares.length >= settings.share_limit && nested !== 'remove') {
        return respond.reply(message, 'bad', `You already used all ${settings.share_limit} share slot(s).`);
      }

      if (nested === 'remove' || nested === 'delete') {
        args.shift();
        const target = await findMember(message.guild, args.join(' '));
        if (!target) {
          return respond.reply(message, 'info', 'Use `boosterrole share remove <member>`.', { mentionUser: false });
        }
        await unshareBoosterRole(message.guild, message.member, target);
        return respond.reply(message, 'good', `Removed your booster role from ${target}.`);
      }

      const target = await findMember(message.guild, args.join(' '));
      if (!target) {
        return respond.reply(message, 'info', 'Use `boosterrole share <member>`.', { mentionUser: false });
      }
      if (target.id === message.author.id) {
        return respond.reply(message, 'bad', 'You already own the role. Share it with someone else.');
      }

      await shareBoosterRole(message.guild, message.member, target);
      return respond.reply(message, 'good', `Shared your booster role with ${target}.`);
    }

    if (sub === 'limit') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to change the booster-role creation toggle.');
      }

      const enabled = parseOnOff(args[0]);
      if (enabled == null) {
        return respond.reply(message, 'info', `Creation is currently **${settings.creation_enabled ? 'enabled' : 'disabled'}**.`, {
          mentionUser: false
        });
      }

      await updateBoosterRoleSettings(message.guild.id, {
        creation_enabled: enabled,
        updated_by: message.author.id
      }, message.author.id);
      return respond.reply(message, 'good', `Booster-role creation is now **${enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'hoist') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to set the booster-role hoist range.');
      }

      const resolved = await resolveTwoRoles(message, [...args]);
      if (!resolved.topRole || !resolved.bottomRole) {
        return respond.reply(message, 'info', 'Use `boosterrole hoist <top role> <bottom role>`.', { mentionUser: false });
      }

      await updateBoosterRoleSettings(message.guild.id, {
        top_role_id: resolved.topRole.id,
        bottom_role_id: resolved.bottomRole.id,
        updated_by: message.author.id
      }, message.author.id);

      const moved = await repositionBoosterRoles(message.guild).catch(() => ({ moved: 0 }));
      return respond.reply(
        message,
        'good',
        `Booster roles will now live between ${resolved.topRole} and ${resolved.bottomRole}. Repositioned ${moved.moved || 0} role(s).`
      );
    }

    if (sub === 'cleanup') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to clean up booster roles.');
      }

      if (String(args[0] || '').toLowerCase() === 'auto') {
        const premium = await requireServerPremium(message, 'Automatic booster-role cleanup');
        if (!premium) return null;

        const enabled = parseOnOff(args[1]);
        if (enabled == null) {
          return respond.reply(message, 'info', 'Use `boosterrole cleanup auto <on|off>`.', { mentionUser: false });
        }

        await updateBoosterRoleSettings(message.guild.id, {
          auto_cleanup: enabled,
          updated_by: message.author.id
        }, message.author.id);
        return respond.reply(message, 'good', `Automatic booster-role cleanup is now **${enabled ? 'on' : 'off'}**.`);
      }

      const result = await cleanupBoosterRoles(message.guild, { automatic: false, actorId: message.author.id });
      return respond.reply(message, 'good', null, {
        allowTitle: true,
        title: 'Booster role cleanup',
        mentionUser: false,
        description: [
          `Deleted roles: **${result.deletedRoles}**`,
          `Removed stale shares: **${result.removedShares}**`,
          `Left untouched: **${result.untouched}**`
        ].join('\n')
      });
    }

    if (sub === 'filter') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to edit booster-role filters.');
      }

      const action = String(args.shift() || 'list').toLowerCase();
      if (action === 'list' || action === 'view') {
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Booster role filters',
          mentionUser: false,
          description: (settings.name_filters_json || []).length
            ? settings.name_filters_json.map((entry, index) => `**${index + 1}.** ${entry}`).join('\n')
            : 'No blocked words are configured.'
        });
      }

      if (action === 'clear') {
        await updateBoosterRoleSettings(message.guild.id, {
          name_filters_json: [],
          updated_by: message.author.id
        }, message.author.id);
        return respond.reply(message, 'good', 'Cleared all booster-role blocked words.');
      }

      const value = args.join(' ').trim();
      if (!value) {
        return respond.reply(message, 'info', 'Use `boosterrole filter <add|remove|list|clear> <word>`.', { mentionUser: false });
      }

      const next = new Set(settings.name_filters_json || []);
      if (action === 'add') next.add(value);
      if (action === 'remove' || action === 'delete') next.delete(value);
      await updateBoosterRoleSettings(message.guild.id, {
        name_filters_json: [...next],
        updated_by: message.author.id
      }, message.author.id);
      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Updated'} booster-role word filters.`);
    }

    if (sub === 'regex' && String(args[0] || '').toLowerCase() === 'filter') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to edit regex filters.');
      }

      const premium = await requireServerPremium(message, 'Booster role regex filters');
      if (!premium) return null;

      args.shift();
      const action = String(args.shift() || 'list').toLowerCase();
      if (action === 'list' || action === 'view') {
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Booster role regex filters',
          mentionUser: false,
          description: (settings.regex_filters_json || []).length
            ? settings.regex_filters_json.map((entry, index) => `**${index + 1}.** \`${entry}\``).join('\n')
            : 'No regex filters are configured.'
        });
      }

      if (action === 'clear') {
        await updateBoosterRoleSettings(message.guild.id, {
          regex_filters_json: [],
          updated_by: message.author.id
        }, message.author.id);
        return respond.reply(message, 'good', 'Cleared all booster-role regex filters.');
      }

      const value = args.join(' ').trim();
      if (!value) {
        return respond.reply(message, 'info', 'Use `boosterrole regex filter <add|remove|list|clear> <pattern>`.', { mentionUser: false });
      }

      try {
        new RegExp(value, 'iu');
      } catch {
        return respond.reply(message, 'bad', 'That regex pattern is invalid.');
      }

      const next = new Set(settings.regex_filters_json || []);
      if (action === 'add') next.add(value);
      if (action === 'remove' || action === 'delete') next.delete(value);
      await updateBoosterRoleSettings(message.guild.id, {
        regex_filters_json: [...next],
        updated_by: message.author.id
      }, message.author.id);
      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Updated'} booster-role regex filters.`);
    }

    if (sub === 'filtericon') {
      if (!isAdmin(message)) {
        return respond.reply(message, 'bad', 'You need Manage Roles to edit icon filters.');
      }
      if (String(args[0] || '').toLowerCase() !== 'nsfw') {
        return respond.reply(message, 'info', 'Use `boosterrole filtericon nsfw <on|off>`.', { mentionUser: false });
      }

      const premium = await requireServerPremium(message, 'Booster role icon filter');
      if (!premium) return null;

      const enabled = parseOnOff(args[1]);
      if (enabled == null) {
        return respond.reply(message, 'info', 'Use `boosterrole filtericon nsfw <on|off>`.', { mentionUser: false });
      }

      await updateBoosterRoleSettings(message.guild.id, {
        icon_nsfw_filter: enabled,
        updated_by: message.author.id
      }, message.author.id);
      return respond.reply(message, 'good', `Booster-role NSFW icon filtering is now **${enabled ? 'on' : 'off'}**.`);
    }

    if (sub === 'filters') {
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Booster role filter summary',
        mentionUser: false,
        description: [
          `Blocked words: **${(settings.name_filters_json || []).length}**`,
          `Regex filters: **${(settings.regex_filters_json || []).length}**`,
          `Icon NSFW filter: **${settings.icon_nsfw_filter ? 'on' : 'off'}**`,
          `Auto cleanup: **${settings.auto_cleanup ? 'on' : 'off'}**`
        ].join('\n')
      });
    }

    return respond.reply(message, 'info', 'Use `boosterrole` with one of its listed subcommands.', { mentionUser: false });
  }
};
