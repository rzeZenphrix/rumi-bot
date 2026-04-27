const { getGuildCustomization } = require('../customization/customizationStore');

function safe(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function define(name, description, example = '') {
  return {
    name,
    syntax: `{${name}}`,
    description,
    example,
    category: name.split('.')[0]
  };
}

function makeVariables() {
  const variables = [
    define('user.id', 'Current user ID', '{user.id}'),
    define('user.username', 'Current username', '{user.username}'),
    define('user.global_name', 'Global display name', '{user.global_name}'),
    define('user.tag', 'User tag', '{user.tag}'),
    define('user.mention', 'User mention', '{user.mention}'),
    define('user.avatar', 'User avatar URL', '{user.avatar}'),
    define('user.bot', 'Whether the user is a bot', '{user.bot}'),
    define('user.created_at', 'Account creation timestamp', '{user.created_at}'),
    define('member.id', 'Current member ID', '{member.id}'),
    define('member.display_name', 'Server display name', '{member.display_name}'),
    define('member.nickname', 'Server nickname', '{member.nickname}'),
    define('member.joined_at', 'Join timestamp', '{member.joined_at}'),
    define('member.roles', 'Member role mentions', '{member.roles}'),
    define('member.role_count', 'Number of roles', '{member.role_count}'),
    define('guild.id', 'Server ID', '{guild.id}'),
    define('guild.name', 'Server name', '{guild.name}'),
    define('guild.icon', 'Server icon URL', '{guild.icon}'),
    define('guild.banner', 'Server banner URL', '{guild.banner}'),
    define('guild.member_count', 'Server member count', '{guild.member_count}'),
    define('guild.owner_id', 'Server owner ID', '{guild.owner_id}'),
    define('guild.created_at', 'Server creation timestamp', '{guild.created_at}'),
    define('guild.vanity', 'Server vanity invite code', '{guild.vanity}'),
    define('guild.tag', 'Server acronym / short tag', '{guild.tag}'),
    define('channel.id', 'Channel ID', '{channel.id}'),
    define('channel.name', 'Channel name', '{channel.name}'),
    define('channel.mention', 'Channel mention', '{channel.mention}'),
    define('channel.type', 'Channel type', '{channel.type}'),
    define('message.id', 'Message ID', '{message.id}'),
    define('message.content', 'Message content', '{message.content}'),
    define('message.url', 'Message URL', '{message.url}'),
    define('bot.id', 'Bot ID', '{bot.id}'),
    define('bot.name', 'Bot username', '{bot.name}'),
    define('bot.avatar', 'Bot avatar URL', '{bot.avatar}'),
    define('date', 'Current date', '{date}'),
    define('time', 'Current time', '{time}'),
    define('timestamp', 'Current UNIX timestamp', '{timestamp}'),
    define('newline', 'New line', '{newline}'),
    define('prefix', 'Server prefix', '{prefix}'),
    define('bot.custom.name', 'Server-specific bot display name', '{bot.custom.name}'),
    define('bot.custom.avatar', 'Server-specific bot avatar URL', '{bot.custom.avatar}'),
    define('bot.custom.banner', 'Server-specific bot banner URL', '{bot.custom.banner}'),
    define('bot.custom.bio', 'Server-specific bot bio', '{bot.custom.bio}'),
    define('bot.reply.mode', 'Server reply mode', '{bot.reply.mode}'),
    define('bot.reply.emoji.info', 'Server info reply emoji', '{bot.reply.emoji.info}'),
    define('bot.reply.emoji.good', 'Server success reply emoji', '{bot.reply.emoji.good}'),
    define('bot.reply.emoji.bad', 'Server error reply emoji', '{bot.reply.emoji.bad}'),
    define('bot.reply.emoji.alert', 'Server warning reply emoji', '{bot.reply.emoji.alert}'),
    define('bot.reply.emoji.list', 'Server list reply emoji', '{bot.reply.emoji.list}'),
    define('bot.reply.color.info', 'Server info reply color', '{bot.reply.color.info}'),
    define('bot.reply.color.good', 'Server success reply color', '{bot.reply.color.good}'),
    define('bot.reply.color.bad', 'Server error reply color', '{bot.reply.color.bad}'),
    define('bot.reply.color.alert', 'Server warning reply color', '{bot.reply.color.alert}'),
    define('bot.reply.color.list', 'Server list reply color', '{bot.reply.color.list}')
  ];

  for (let i = 1; i <= 80; i += 1) {
    variables.push(define(`arg.${i}`, `Argument number ${i}`, `{arg.${i}}`));
  }

  return variables;
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
    'user.username': user.username,
    'user.name': user.username,
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
    'guild.vanity': guild?.vanityURLCode || '',
    'guild.tag': guild?.nameAcronym || '',

    'channel.id': channel?.id,
    'channel.name': channel?.name,
    'channel.mention': channel?.id ? `<#${channel.id}>` : '',
    'channel.type': channel?.type,

    'message.id': message.id,
    'message.content': message.content,
    'message.url': message.url,

    'bot.id': client.user?.id,
    'bot.name': client.user?.username,
    'bot.avatar': client.user?.displayAvatarURL?.({ size: 4096, extension: 'png' }),

    'bot.custom.name': custom?.botProfile?.nickname || client.user?.displayName || client.user?.username,
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
