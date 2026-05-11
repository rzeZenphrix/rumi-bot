const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

function parseCustomId(customId) {
  const match = String(customId || '').match(/^unban_rejoin:(\d{17,20}):(\d{17,20})$/);

  if (!match) return null;

  return {
    guildId: match[1],
    userId: match[2]
  };
}

function inviteCapableTypes() {
  return new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum
  ]);
}

function canCreateInvite(channel, me) {
  if (!channel || typeof channel.createInvite !== 'function') return false;
  if (!inviteCapableTypes().has(channel.type)) return false;

  const permissions = channel.permissionsFor(me);

  return Boolean(
    permissions &&
    permissions.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.CreateInstantInvite)
  );
}

async function createInviteForGuild(guild, userId) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (!me) {
    throw new Error('I could not check my server permissions.');
  }

  await guild.channels.fetch().catch(() => null);

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => canCreateInvite(channel, me))
    .sort((a, b) => {
      const aText = a.type === ChannelType.GuildText || a.type === ChannelType.GuildAnnouncement ? 0 : 1;
      const bText = b.type === ChannelType.GuildText || b.type === ChannelType.GuildAnnouncement ? 0 : 1;
      return aText - bText || (a.rawPosition ?? 9999) - (b.rawPosition ?? 9999);
    });

  for (const channel of channels) {
    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: false,
      reason: `Unbanned user requested rejoin invite: ${userId}`
    }).catch(() => null);

    if (invite?.url) return invite;
  }

  throw new Error('I could not create an invite. I need Create Invite permission in at least one channel.');
}

async function handleUnbanRejoinButton(interaction) {
  if (!interaction.isButton?.()) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({
      content: 'This rejoin button is not for your account.',
      allowedMentions: { parse: [] }
    }).catch(() => null);

    return true;
  }

  await interaction.deferReply().catch(() => null);

  const guild =
    interaction.client.guilds.cache.get(parsed.guildId) ||
    await interaction.client.guilds.fetch(parsed.guildId).catch(() => null);

  if (!guild) {
    await interaction.editReply({
      content: 'I could not find that server anymore.',
      allowedMentions: { parse: [] }
    }).catch(() => null);

    return true;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);

  if (member) {
    await interaction.editReply({
      content: `You are already back in **${guild.name}**.`,
      allowedMentions: { parse: [] }
    }).catch(() => null);

    return true;
  }

  try {
    const invite = await createInviteForGuild(guild, interaction.user.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Join ${guild.name}`)
        .setStyle(ButtonStyle.Link)
        .setURL(invite.url)
    );

    await interaction.editReply({
      content: `Here is your invite to **${guild.name}**: ${invite.url}`,
      components: [row],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  } catch (error) {
    await interaction.editReply({
      content: error.message || 'I could not create an invite right now.',
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  return true;
}

module.exports = {
  handleUnbanRejoinButton
};