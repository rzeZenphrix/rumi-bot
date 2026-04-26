const { getGuildCustomization } = require('../customization/customizationStore');

function safe(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function makeVariables() {
  const variables = [
    ['user.id', 'Current user ID'],
    ['user.name', 'Current username'],
    ['user.username', 'Current username'],
    ['user.global_name', 'Global display name'],
    ['user.tag', 'User tag'],
    ['user.mention', 'User mention'],
    ['user.avatar', 'User avatar URL'],
    ['user.bot', 'Whether the user is a bot'],
    ['user.created_at', 'Account creation timestamp'],
    ['member.id', 'Current member ID'],
    ['member.display_name', 'Server display name'],
    ['member.nickname', 'Server nickname'],
    ['member.joined_at', 'Join timestamp'],
    ['member.roles', 'Member role mentions'],
    ['member.role_count', 'Number of roles'],
    ['guild.id', 'Server ID'],
    ['guild.name', 'Server name'],
    ['guild.icon', 'Server icon URL'],
    ['guild.banner', 'Server banner URL'],
    ['guild.member_count', 'Server member count'],
    ['guild.owner_id', 'Server owner ID'],
    ['guild.created_at', 'Server creation timestamp'],
    ['channel.id', 'Channel ID'],
    ['channel.name', 'Channel name'],
    ['channel.mention', 'Channel mention'],
    ['channel.type', 'Channel type'],
    ['message.id', 'Message ID'],
    ['message.content', 'Message content'],
    ['message.url', 'Message URL'],
    ['bot.id', 'Bot ID'],
    ['bot.name', 'Bot username'],
    ['bot.avatar', 'Bot avatar URL'],
    ['date', 'Current date'],
    ['time', 'Current time'],
    ['timestamp', 'Current UNIX timestamp'],
    ['newline', 'New line'],
    ['prefix', 'Server prefix'],
    ['bot.custom.name', 'Server-specific bot display name'],
    ['bot.custom.avatar', 'Server-specific bot avatar URL'],
    ['bot.custom.banner', 'Server-specific bot banner URL'],
    ['bot.custom.bio', 'Server-specific bot bio'],
    ['bot.reply.mode', 'Server reply mode'],
    ['bot.reply.emoji.info', 'Server info reply emoji'],
    ['bot.reply.emoji.good', 'Server success reply emoji'],
    ['bot.reply.emoji.bad', 'Server error reply emoji'],
    ['bot.reply.emoji.alert', 'Server warning reply emoji'],
    ['bot.reply.emoji.list', 'Server list reply emoji'],
    ['bot.reply.color.info', 'Server info reply color'],
    ['bot.reply.color.good', 'Server success reply color'],
    ['bot.reply.color.bad', 'Server error reply color'],
    ['bot.reply.color.alert', 'Server warning reply color'],
    ['bot.reply.color.list', 'Server list reply color'],
  ];

  for (let i = 1; i <= 80; i += 1) {
    variables.push([`arg.${i}`, `Argument number ${i}`]);
  }

  return variables.map(([name, description]) => ({
    name,
    syntax: `{${name}}`,
    description,
    category: name.split('.')[0]
  }));
}

const VARIABLES = makeVariables();

async function resolveVariable(name, context) {
  const { client, message, args = [], prefix = ',' } = context;
  const member = message.member;
  const user = message.author;
  const guild = message.guild;
  const channel = message.channel;
  const now = new Date();
  const custom = guild ? getGuildCustomization(guild.id) : null;

  const map = {
    'user.id': user.id,
    'user.name': user.username,
    'user.username': user.username,
    'user.global_name': user.globalName || user.username,
    'user.tag': user.tag || user.username,
    'user.mention': `<@${user.id}>`,
    'user.avatar': user.displayAvatarURL({ size: 4096, extension: 'png', forceStatic: false }),
    'user.bot': user.bot,
    'user.created_at': `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,

    'member.id': member?.id,
    'member.display_name': member?.displayName,
    'member.nickname': member?.nickname,
    'member.joined_at': member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : '', 
    'member.roles': member?.roles?.cache?.filter((r) => r.id !== guild.id).map((r) => `<@&${r.id}>`).join(', '),
    'member.role_count': member?.roles?.cache?.size || 0,

    'guild.id': guild?.id,
    'guild.name': guild?.name,
    'guild.icon': guild?.iconURL?.({ size: 4096, extension: 'png' }),
    'guild.banner': guild?.bannerURL?.({ size: 4096, extension: 'png' }),
    'guild.member_count': guild?.memberCount,
    'guild.owner_id': guild?.ownerId,
    'guild.created_at': guild?.createdTimestamp ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>` : '',

    'channel.id': channel?.id,
    'channel.name': channel?.name,
    'channel.mention': `<#${channel?.id}>`,
    'channel.type': channel?.type,

    'message.id': message.id,
    'message.content': message.content,
    'message.url': message.url,

    'bot.id': client.user?.id,
    'bot.name': client.user?.username,
    'bot.avatar': client.user?.displayAvatarURL?.({ size: 4096, extension: 'png' }),

    'bot.custom.name': custom?.botProfile?.username || client.user?.username,
    'bot.custom.avatar': custom?.botProfile?.avatarUrl || client.user?.displayAvatarURL?.({ size: 4096, extension: 'png' }),
    'bot.custom.banner': custom?.botProfile?.bannerUrl || '',
    'bot.custom.bio': custom?.botProfile?.bio || '',
    'bot.reply.mode': custom?.replyMode || 'bot',
    'bot.reply.emoji.info': custom?.replyEmojis?.info || '',
    'bot.reply.emoji.good': custom?.replyEmojis?.good || '',
    'bot.reply.emoji.bad': custom?.replyEmojis?.bad || '',
    'bot.reply.emoji.alert': custom?.replyEmojis?.alert || '',
    'bot.reply.emoji.list': custom?.replyEmojis?.list || '',
    'bot.reply.color.info': custom?.replyColors?.info || '',
    'bot.reply.color.good': custom?.replyColors?.good || '',
    'bot.reply.color.bad': custom?.replyColors?.bad || '',
    'bot.reply.color.alert': custom?.replyColors?.alert || '',
    'bot.reply.color.list': custom?.replyColors?.list || '',

    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    timestamp: Math.floor(Date.now() / 1000),
    newline: '\n',
    prefix
  };

  if (name.startsWith('arg.')) {
    const index = Number(name.split('.')[1]) - 1;
    return args[index] || '';
  }

  return safe(map[name], '');
}

async function resolveVariables(input, context) {
  let output = String(input || '');

  const matches = [...output.matchAll(/\{([a-zA-Z0-9_.-]+)(?:\|([^}]*))?\}/g)];

  for (const match of matches) {
    const [raw, name, fallback] = match;
    const value = await resolveVariable(name, context);
    output = output.replaceAll(raw, value || fallback || '');
  }

  return output;
}

module.exports = {
  VARIABLES,
  resolveVariable,
  resolveVariables
};