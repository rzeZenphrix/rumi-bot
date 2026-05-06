const { getGuildCustomization } = require('../customization/customizationStore');

const VARIABLE_NAMES = [
  'guild.name', 'guild.id', 'guild.count', 'guild.region', 'guild.shard', 'guild.owner_id', 'guild.created_at',
  'guild.created_at_timestamp', 'guild.emoji_count', 'guild.role_count', 'guild.boost_count', 'guild.boost_tier',
  'guild.preferred_locale', 'guild.key_features', 'guild.icon', 'guild.banner', 'guild.splash', 'guild.discovery',
  'guild.max_presences', 'guild.max_members', 'guild.max_video_channel_users', 'guild.afk_timeout', 'guild.afk_channel',
  'guild.channels', 'guild.channels_count', 'guild.text_channels', 'guild.text_channels_count', 'guild.voice_channels',
  'guild.voice_channels_count', 'guild.category_channels', 'guild.category_channels_count', 'guild.vanity',
  'user', 'user.id', 'user.mention', 'user.name', 'user.username', 'user.global_name', 'user.tag', 'user.avatar',
  'user.guild_avatar', 'user.banner', 'user.guild_banner', 'user.display_avatar', 'user.joined_at',
  'user.joined_at_timestamp', 'user.created_at', 'user.created_at_timestamp', 'user.display_name', 'user.is_boost',
  'user.boost_since', 'user.boost_since_timestamp', 'user.boost_count', 'user.color', 'user.top_role', 'user.role_list',
  'user.role_list_text', 'user.is_bot', 'user.badges_icons', 'user.badges', 'user.join_position', 'user.join_position_sfx',
  'channel.name', 'channel.id', 'channel.mention', 'channel.topic', 'channel.type', 'channel.category_id',
  'channel.category_name', 'channel.position', 'channel.slowmode_delay',
  'date.now', 'date.utc_timestamp', 'date.now_proper', 'date.now_short', 'date.now_shorter', 'time.now',
  'time.now_military', 'date.utc_now', 'date.utc_now_proper', 'date.utc_now_short', 'date.utc_now_shorter',
  'time.utc_now', 'time.utc_now_military', 'date.discord_timestamp', 'date.discord_relative',
  'level.new_rank', 'level.old_rank', 'level.next_rank', 'level.user_xp', 'level.server_xp', 'level.user_xp_total',
  'level.server_xp_total', 'level.xp_needed', 'level.progress', 'level.rank_position',
  'boost.count', 'boost.tier', 'boost.perks', 'boost.user_since', 'boost.user_since_timestamp', 'boost.next_tier',
  'moderator', 'moderator.name', 'moderator.tag', 'moderator.avatar', 'moderator.bot', 'moderator.color',
  'moderator.role', 'moderator.mention', 'moderator.created_at', 'moderator.id',
  'punishment.reason', 'punishment.duration', 'punishment.invite_url', 'punishment.type', 'punishment.case_id',
  'punishment.created_at', 'punishment.created_at_timestamp', 'punishment.expires_at',
  'punishment.expires_at_timestamp', 'punishment.channel', 'punishment.guild',
  'giveaway.id', 'giveaway.prize', 'giveaway.title', 'giveaway.description', 'giveaway.host', 'giveaway.host_id',
  'giveaway.host_mention', 'giveaway.winners_count', 'giveaway.entries_count', 'giveaway.entry_mode',
  'giveaway.reaction_emoji', 'giveaway.status', 'giveaway.channel', 'giveaway.channel_id', 'giveaway.message_id',
  'giveaway.message_url', 'giveaway.created_at', 'giveaway.created_at_timestamp', 'giveaway.starts_at',
  'giveaway.starts_at_timestamp', 'giveaway.ends_at', 'giveaway.ends_at_timestamp', 'giveaway.ends_relative',
  'giveaway.duration', 'giveaway.conditions', 'giveaway.entry_conditions', 'giveaway.winner_conditions',
  'giveaway.bonus_rules', 'giveaway.winners', 'giveaway.winner_mentions', 'giveaway.reroll_count',
  'winner', 'winner.id', 'winner.name', 'winner.mention', 'winner.avatar', 'winner.display_name', 'winner.entries',
  'winner.bonus_entries',
  'ticket.id', 'ticket.number', 'ticket.user', 'ticket.user_id', 'ticket.user_mention', 'ticket.channel',
  'ticket.channel_id', 'ticket.type', 'ticket.reason', 'ticket.status', 'ticket.claimed_by', 'ticket.claimed_by_id',
  'ticket.claimed_by_mention', 'ticket.created_at', 'ticket.created_at_timestamp', 'ticket.closed_at',
  'ticket.closed_at_timestamp', 'ticket.closed_by', 'ticket.closed_by_id', 'ticket.closed_by_mention',
  'verification.mode', 'verification.channel', 'verification.channel_id', 'verification.verified_role',
  'verification.verified_role_id', 'verification.unverified_role', 'verification.unverified_role_id',
  'verification.captcha_code', 'verification.status',
  'bot.name', 'bot.id', 'bot.mention', 'bot.avatar', 'bot.prefix', 'bot.version', 'bot.uptime', 'bot.guild_count',
  'bot.user_count', 'bot.command_count', 'bot.shard_id', 'bot.shard_count', 'bot.support_server', 'bot.website',
  'bot.dashboard', 'bot.invite',
  'command.name', 'command.alias', 'command.category', 'command.usage', 'command.description', 'command.user',
  'command.user_id', 'command.user_mention', 'command.channel', 'command.channel_id', 'command.args', 'command.args_raw',
  'args', 'args.raw',
  'economy.balance', 'economy.bank', 'economy.wallet', 'economy.networth', 'economy.rank', 'economy.daily_streak',
  'invite.code', 'invite.url', 'invite.inviter', 'invite.inviter_id', 'invite.inviter_mention', 'invite.uses',
  'invite.max_uses', 'invite.created_at', 'invite.created_at_timestamp', 'invite.channel', 'invite.channel_id',
  'newline', 'prefix', 'date', 'time', 'timestamp'
];

for (let index = 1; index <= 80; index += 1) {
  VARIABLE_NAMES.push(`arg.${index}`, `args.after.${index}`);
}

function define(name) {
  return {
    name,
    syntax: `{${name}}`,
    description: `${name} variable`,
    example: `{${name}}`,
    category: name.split('.')[0]
  };
}

const VARIABLES = VARIABLE_NAMES.map(define);

function valueOrNA(value, fallback = 'N/A') {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
  return String(value);
}

function unix(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

function discordTime(dateLike, style = 'F') {
  const stamp = unix(dateLike);
  return stamp ? `<t:${stamp}:${style}>` : 'N/A';
}

function formatDate(dateLike, timeZone = 'America/Los_Angeles', opts = {}) {
  const date = dateLike ? new Date(dateLike) : new Date();
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', {
    timeZone,
    year: 'numeric',
    month: opts.short ? 'short' : 'long',
    day: 'numeric',
    hour: opts.noTime ? undefined : 'numeric',
    minute: opts.noTime ? undefined : '2-digit'
  });
}

function suffix(number) {
  const value = Number(number || 0);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function memberRoles(member, textOnly = false) {
  const guildId = member?.guild?.id;
  const roles = member?.roles?.cache?.filter((role) => role.id !== guildId).sort((a, b) => b.position - a.position);
  if (!roles?.size) return 'N/A';
  return roles.map((role) => (textOnly ? role.name : `<@&${role.id}>`)).join(', ');
}

function channelList(guild, predicate) {
  const channels = guild?.channels?.cache?.filter(predicate);
  if (!channels?.size) return 'N/A';
  return channels.map((channel) => `<#${channel.id}>`).join(', ');
}

function boostTier(guild) {
  const tier = Number(guild?.premiumTier || 0);
  return tier ? `Level ${tier}` : 'No Level';
}

function uptime(ms) {
  const seconds = Math.floor(Number(ms || 0) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function buildBaseContext(context = {}) {
  const message = context.message || null;
  const client = context.client || message?.client || context.guild?.client || null;
  const guild = context.guild || message?.guild || context.member?.guild || null;
  const member = context.member || message?.member || null;
  const user = context.user || member?.user || message?.author || null;
  const channel = context.channel || message?.channel || null;
  const moderator = context.moderator || context.moderatorMember || null;
  const moderatorUser = moderator?.user || context.moderatorUser || moderator || null;
  const args = context.args || [];
  const custom = guild ? getGuildCustomization(guild.id) : null;

  return { client, guild, member, user, channel, moderator, moderatorUser, args, custom };
}

function staticMap(context = {}) {
  const { client, guild, member, user, channel, moderator, moderatorUser, args, custom } = buildBaseContext(context);
  const now = new Date();
  const punishment = context.punishment || {};
  const giveaway = context.giveaway || {};
  const winner = context.winner || {};
  const ticket = context.ticket || {};
  const verification = context.verification || {};
  const command = context.command || {};
  const economy = context.economy || {};
  const invite = context.invite || {};
  const prefix = context.prefix || guild?.preferredPrefix || process.env.DEFAULT_PREFIX || ',';
  const topRole = member?.roles?.highest;
  const botUser = client?.user;
  const guildChannels = guild?.channels?.cache;

  return {
    user: user?.tag || user?.username,
    'user.id': user?.id,
    'user.mention': user?.id ? `<@${user.id}>` : null,
    'user.name': user?.username,
    'user.username': user?.username,
    'user.global_name': user?.globalName || user?.username,
    'user.tag': user?.discriminator && user.discriminator !== '0' ? user.discriminator : '0',
    'user.avatar': user?.displayAvatarURL?.({ size: 4096, extension: 'png', forceStatic: false }),
    'user.guild_avatar': member?.displayAvatarURL?.({ size: 4096, extension: 'png', forceStatic: false }),
    'user.banner': user?.bannerURL?.({ size: 4096, extension: 'png' }),
    'user.guild_banner': member?.bannerURL?.({ size: 4096, extension: 'png' }),
    'user.display_avatar': member?.displayAvatarURL?.({ size: 4096, extension: 'png', forceStatic: false }) || user?.displayAvatarURL?.({ size: 4096, extension: 'png', forceStatic: false }),
    'user.joined_at': member?.joinedTimestamp ? discordTime(member.joinedTimestamp) : null,
    'user.joined_at_timestamp': member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null,
    'user.created_at': user?.createdTimestamp ? discordTime(user.createdTimestamp) : null,
    'user.created_at_timestamp': user?.createdTimestamp ? Math.floor(user.createdTimestamp / 1000) : null,
    'user.display_name': member?.displayName || user?.globalName || user?.username,
    'user.is_boost': member?.premiumSinceTimestamp ? 'Yes' : 'No',
    'user.boost_since': member?.premiumSinceTimestamp ? discordTime(member.premiumSinceTimestamp) : null,
    'user.boost_since_timestamp': member?.premiumSinceTimestamp ? Math.floor(member.premiumSinceTimestamp / 1000) : null,
    'user.boost_count': context.boost?.count,
    'user.color': topRole?.hexColor,
    'user.top_role': topRole?.id !== guild?.id ? topRole?.name : null,
    'user.role_list': memberRoles(member),
    'user.role_list_text': memberRoles(member, true),
    'user.is_bot': user?.bot ? 'Yes' : 'No',
    'user.badges_icons': context.badgesIcons,
    'user.badges': context.badges,
    'user.join_position': context.joinPosition,
    'user.join_position_sfx': context.joinPosition ? suffix(context.joinPosition) : null,

    'guild.name': guild?.name,
    'guild.id': guild?.id,
    'guild.count': guild?.memberCount,
    'guild.member_count': guild?.memberCount,
    'guild.region': guild?.preferredLocale || 'Automatic',
    'guild.shard': guild?.shardId,
    'guild.owner_id': guild?.ownerId,
    'guild.created_at': guild?.createdTimestamp ? discordTime(guild.createdTimestamp) : null,
    'guild.created_at_timestamp': guild?.createdTimestamp ? Math.floor(guild.createdTimestamp / 1000) : null,
    'guild.emoji_count': guild?.emojis?.cache?.size,
    'guild.role_count': guild?.roles?.cache?.size,
    'guild.boost_count': guild?.premiumSubscriptionCount || 0,
    'guild.boost_tier': boostTier(guild),
    'guild.preferred_locale': guild?.preferredLocale,
    'guild.key_features': guild?.features?.length ? guild.features.join(', ') : null,
    'guild.icon': guild?.iconURL?.({ size: 4096, extension: 'png' }),
    'guild.banner': guild?.bannerURL?.({ size: 4096, extension: 'png' }),
    'guild.splash': guild?.splashURL?.({ size: 4096, extension: 'png' }),
    'guild.discovery': guild?.discoverySplashURL?.({ size: 4096, extension: 'png' }),
    'guild.max_presences': guild?.maximumPresences,
    'guild.max_members': guild?.maximumMembers,
    'guild.max_video_channel_users': guild?.maxVideoChannelUsers,
    'guild.afk_timeout': guild?.afkTimeout,
    'guild.afk_channel': guild?.afkChannelId ? `<#${guild.afkChannelId}>` : null,
    'guild.channels': channelList(guild, () => true),
    'guild.channels_count': guildChannels?.size,
    'guild.text_channels': channelList(guild, (ch) => ch.isTextBased?.()),
    'guild.text_channels_count': guildChannels?.filter((ch) => ch.isTextBased?.()).size,
    'guild.voice_channels': channelList(guild, (ch) => ch.isVoiceBased?.()),
    'guild.voice_channels_count': guildChannels?.filter((ch) => ch.isVoiceBased?.()).size,
    'guild.category_channels': channelList(guild, (ch) => ch.type === 4),
    'guild.category_channels_count': guildChannels?.filter((ch) => ch.type === 4).size,
    'guild.vanity': guild?.vanityURLCode,
    'server.name': guild?.name,
    'server.id': guild?.id,

    'channel.name': channel?.name,
    'channel.id': channel?.id,
    'channel.mention': channel?.id ? `<#${channel.id}>` : null,
    'channel.topic': channel?.topic,
    'channel.type': channel?.type,
    'channel.category_id': channel?.parentId,
    'channel.category_name': channel?.parent?.name,
    'channel.position': channel?.position,
    'channel.slowmode_delay': channel?.rateLimitPerUser || 0,

    'date.now': formatDate(now, 'America/Los_Angeles', { noTime: true }),
    'date.utc_timestamp': Math.floor(now.getTime() / 1000),
    'date.now_proper': formatDate(now, 'America/Los_Angeles'),
    'date.now_short': formatDate(now, 'America/Los_Angeles', { short: true }),
    'date.now_shorter': now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
    'time.now': now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }),
    'time.now_military': now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false }),
    'date.utc_now': formatDate(now, 'UTC', { noTime: true }),
    'date.utc_now_proper': formatDate(now, 'UTC'),
    'date.utc_now_short': formatDate(now, 'UTC', { short: true }),
    'date.utc_now_shorter': now.toISOString().slice(0, 10),
    'time.utc_now': now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }),
    'time.utc_now_military': now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }),
    'date.discord_timestamp': `<t:${Math.floor(now.getTime() / 1000)}:F>`,
    'date.discord_relative': `<t:${Math.floor(now.getTime() / 1000)}:R>`,

    'bot.name': botUser?.username,
    'bot.id': botUser?.id,
    'bot.mention': botUser?.id ? `<@${botUser.id}>` : null,
    'bot.avatar': botUser?.displayAvatarURL?.({ size: 4096, extension: 'png' }),
    'bot.prefix': prefix,
    'bot.version': process.env.npm_package_version || '0.6.0',
    'bot.uptime': uptime(client?.uptime),
    'bot.guild_count': client?.guilds?.cache?.size,
    'bot.user_count': client?.guilds?.cache?.reduce?.((sum, item) => sum + Number(item.memberCount || 0), 0),
    'bot.command_count': client?.commands?.size,
    'bot.shard_id': guild?.shardId || 0,
    'bot.shard_count': client?.shard?.count || 1,
    'bot.support_server': process.env.SUPPORT_SERVER_INVITE || process.env.SUPPORT_URL,
    'bot.website': process.env.PUBLIC_SITE_URL || process.env.WEBSITE_URL,
    'bot.dashboard': process.env.STUDIO_URL || process.env.DASHBOARD_URL,
    'bot.invite': process.env.BOT_INVITE_URL,
    'bot.custom.name': custom?.botProfile?.nickname || botUser?.username,
    'bot.custom.avatar': custom?.botProfile?.avatarUrl || botUser?.displayAvatarURL?.({ size: 4096, extension: 'png' }),
    'bot.custom.banner': custom?.botProfile?.bannerUrl,
    'bot.custom.bio': custom?.botProfile?.bio,
    'bot.reply.mode': custom?.replyMode || 'bot',
    'bot.reply.emoji.info': custom?.replyEmojis?.info,
    'bot.reply.emoji.good': custom?.replyEmojis?.good,
    'bot.reply.emoji.bad': custom?.replyEmojis?.bad,
    'bot.reply.emoji.alert': custom?.replyEmojis?.alert,
    'bot.reply.emoji.list': custom?.replyEmojis?.list,
    'bot.reply.color.info': custom?.replyColors?.info,
    'bot.reply.color.good': custom?.replyColors?.good,
    'bot.reply.color.bad': custom?.replyColors?.bad,
    'bot.reply.color.alert': custom?.replyColors?.alert,
    'bot.reply.color.list': custom?.replyColors?.list,

    'moderator': moderatorUser?.tag || moderatorUser?.username,
    'moderator.name': moderatorUser?.username,
    'moderator.tag': moderatorUser?.discriminator || '0',
    'moderator.avatar': moderatorUser?.displayAvatarURL?.({ size: 4096, extension: 'png' }),
    'moderator.bot': moderatorUser?.bot ? 'True' : 'False',
    'moderator.color': moderator?.roles?.highest?.hexColor,
    'moderator.role': moderator?.roles?.highest?.name,
    'moderator.mention': moderatorUser?.id ? `<@${moderatorUser.id}>` : null,
    'moderator.created_at': moderatorUser?.createdTimestamp ? discordTime(moderatorUser.createdTimestamp) : null,
    'moderator.id': moderatorUser?.id,

    ...flatObject('level', context.level),
    ...flatObject('boost', context.boost),
    ...flatObject('punishment', punishment),
    ...flatObject('giveaway', giveaway),
    ...flatObject('winner', winner),
    ...flatObject('ticket', ticket),
    ...flatObject('verification', verification),
    ...flatObject('command', command),
    ...flatObject('economy', economy),
    ...flatObject('invite', invite),

    newline: '\n',
    prefix,
    date: formatDate(now, 'America/Los_Angeles', { noTime: true }),
    time: now.toLocaleTimeString(),
    timestamp: Math.floor(now.getTime() / 1000),
    args: args.join(' '),
    'args.raw': context.argsRaw || args.join(' ')
  };
}

function flatObject(prefix, source = {}) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    out[`${prefix}.${key}`] = value;
  }
  return out;
}

async function resolveVariable(name, context = {}) {
  const map = staticMap(context);
  const args = context.args || [];

  if (name.startsWith('arg.')) {
    const index = Number(name.split('.')[1]) - 1;
    return valueOrNA(args[index]);
  }

  if (name.startsWith('args.after.')) {
    const index = Number(name.split('.')[2]);
    return valueOrNA(args.slice(index).join(' '));
  }

  return valueOrNA(map[name]);
}

async function resolveVariables(input, context = {}) {
  const text = String(input ?? '');
  const matches = [...text.matchAll(/\{([a-zA-Z0-9_.-]+)(?:\|([^}]*))?\}/g)];
  let output = text;

  for (const match of matches) {
    const [raw, name, fallback] = match;
    const value = await resolveVariable(name, context);
    output = output.split(raw).join(value === 'N/A' && fallback !== undefined ? fallback : value);
  }

  return output;
}

module.exports = {
  VARIABLES,
  resolveVariable,
  resolveVariables,
  buildBaseContext
};
