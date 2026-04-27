const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { extractId } = require('../../utils/resolveUser');

const TEXT_LOCK_PERMISSIONS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false
};

const TEXT_UNLOCK_PERMISSIONS = {
  SendMessages: null,
  SendMessagesInThreads: null,
  CreatePublicThreads: null,
  CreatePrivateThreads: null
};

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function isLockableTextChannel(channel) {
  return Boolean(
    channel?.permissionOverwrites?.edit
      && [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildForum,
        ChannelType.GuildMedia
      ].includes(channel.type)
  );
}

async function findChannel(guild, input) {
  if (!input) return null;

  const mentionId = String(input).match(/^<#(\d{17,20})>$/)?.[1] || extractId(input);
  if (mentionId) {
    const channel = guild.channels.cache.get(mentionId) || await guild.channels.fetch(mentionId).catch(() => null);
    return isLockableTextChannel(channel) ? channel : null;
  }

  const query = normalizeName(input);
  return guild.channels.cache.find((channel) => isLockableTextChannel(channel) && normalizeName(channel.name) === query)
    || guild.channels.cache.find((channel) => isLockableTextChannel(channel) && normalizeName(channel.name).includes(query))
    || null;
}

async function findRole(guild, input) {
  if (!input) return null;

  const id = String(input).match(/^<@&(\d{17,20})>$/)?.[1] || extractId(input);
  if (id) return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);

  const query = normalizeName(input);
  return guild.roles.cache.find((role) => normalizeName(role.name) === query)
    || guild.roles.cache.find((role) => normalizeName(role.name).includes(query))
    || null;
}

async function resolveChannelRoleTarget(message, args) {
  const remaining = [...args];
  let channel = message.channel;
  let role = message.guild.roles.everyone;

  const maybeChannel = await findChannel(message.guild, remaining[0]);
  if (maybeChannel) {
    channel = maybeChannel;
    remaining.shift();
  }

  const maybeRole = await findRole(message.guild, remaining[0]);
  if (maybeRole) {
    role = maybeRole;
    remaining.shift();
  }

  return { channel, role, remaining };
}

function missingChannelManagePermission(member, channel) {
  return !member?.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
}

module.exports = {
  TEXT_LOCK_PERMISSIONS,
  TEXT_UNLOCK_PERMISSIONS,
  isLockableTextChannel,
  resolveChannelRoleTarget,
  missingChannelManagePermission
};
