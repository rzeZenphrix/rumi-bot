const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');

const JAIL_ROLE_NAME = 'rumi jail';
const JAIL_CHANNEL_NAME = 'rumi-jail';
const LEGACY_JAIL_ROLE_NAMES = [JAIL_ROLE_NAME, 'ohara jail'];
const LEGACY_JAIL_CHANNEL_NAMES = [JAIL_CHANNEL_NAME, 'ohara-jail'];

async function setupJail(guild, actorId = null) {
  const me = guild.members.me || await guild.members.fetchMe();

  let settings = await db.getGuildSettings(guild.id);

  let jailRole = settings.jail_role_id
    ? guild.roles.cache.get(settings.jail_role_id)
    : null;

  if (!jailRole) {
    jailRole = guild.roles.cache.find((role) => {
      return LEGACY_JAIL_ROLE_NAMES.includes(role.name.toLowerCase());
    });

    if (!jailRole) {
      jailRole = await guild.roles.create({
        name: JAIL_ROLE_NAME,
        permissions: [],
        reason: actorId ? `Jail setup requested by ${actorId}` : 'Jail setup'
      });
    }
  }

  const maxPosition = Math.max(1, me.roles.highest.position - 1);

  if (jailRole.editable && jailRole.position < maxPosition) {
    await jailRole.setPosition(maxPosition, {
      reason: 'Move jail role as high as I safely can'
    }).catch((error) => {
      logger.warn({ error, guildId: guild.id }, 'Could not move jail role higher');
    });
  }

  let jailChannel = settings.jail_channel_id
    ? guild.channels.cache.get(settings.jail_channel_id)
    : null;

  if (!jailChannel) {
    jailChannel = guild.channels.cache.find((channel) => {
      return LEGACY_JAIL_CHANNEL_NAMES.includes(channel.name.toLowerCase()) && channel.type === ChannelType.GuildText;
    });

    if (!jailChannel) {
      jailChannel = await guild.channels.create({
        name: JAIL_CHANNEL_NAME,
        type: ChannelType.GuildText,
        reason: actorId ? `Jail setup requested by ${actorId}` : 'Jail setup',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.ViewChannel
            ]
          },
          {
            id: jailRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });
    }
  }

  await db.updateGuildSettings(guild.id, {
    jail_enabled: true,
    jail_role_id: jailRole.id,
    jail_channel_id: jailChannel.id
  });

  const result = await hardenJailPermissions(guild, jailRole, jailChannel);

  return {
    jailRole,
    jailChannel,
    deniedChannels: result.deniedChannels,
    failedChannels: result.failedChannels
  };
}

async function hardenJailPermissions(guild, jailRole, jailChannel) {
  let deniedChannels = 0;
  let failedChannels = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.manageable) continue;

    try {
      if (channel.id === jailChannel.id) {
        await channel.permissionOverwrites.edit(
          guild.roles.everyone,
          {
            ViewChannel: false
          },
          {
            reason: 'Keep jail channel private'
          }
        );

        await channel.permissionOverwrites.edit(
          jailRole,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          },
          {
            reason: 'Allow jailed users to see jail channel'
          }
        );

        continue;
      }

      await channel.permissionOverwrites.edit(
        jailRole,
        {
          ViewChannel: false
        },
        {
          reason: 'Hide normal channels from jailed users'
        }
      );

      deniedChannels += 1;
    } catch (error) {
      failedChannels += 1;
      logger.warn(
        {
          error,
          guildId: guild.id,
          channelId: channel.id
        },
        'Could not apply jail overwrite'
      );
    }
  }

  return {
    deniedChannels,
    failedChannels
  };
}

async function protectNewChannel(channel) {
  if (!channel.guild || !channel.manageable) return false;

  const settings = await db.getGuildSettings(channel.guild.id);

  if (!settings.jail_role_id) return false;

  const jailRole = channel.guild.roles.cache.get(settings.jail_role_id);

  if (!jailRole) return false;

  if (settings.jail_channel_id && channel.id === settings.jail_channel_id) {
    await channel.permissionOverwrites.edit(
      jailRole,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      },
      {
        reason: 'Keep jail channel visible to jailed users'
      }
    ).catch(() => null);

    return true;
  }

  await channel.permissionOverwrites.edit(
    jailRole,
    {
      ViewChannel: false
    },
    {
      reason: 'Auto-protect new channel from jailed users'
    }
  ).catch((error) => {
    logger.warn(
      {
        error,
        guildId: channel.guild.id,
        channelId: channel.id
      },
      'Could not protect new channel from jail role'
    );
  });

  return true;
}

module.exports = {
  JAIL_ROLE_NAME,
  JAIL_CHANNEL_NAME,
  setupJail,
  hardenJailPermissions,
  protectNewChannel
};
