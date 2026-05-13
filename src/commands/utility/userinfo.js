const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');

const respond = require('../../utils/respond');
const emojis = require('../../utils/botEmojis');
const { resolveMember, resolveUser } = require('../../utils/resolveUser');

const DEFAULT_ACCENT = 0xc8d8f2;

function clean(value, fallback = 'n/a') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function truncate(value, max = 3900) {
  const text = clean(value, '\u200B');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function number(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
}

function icon(name) {
  return String(emojis?.[name] || '').trim();
}

function withIcon(name, text) {
  const emoji = icon(name);
  return emoji ? `${emoji} ${text}` : text;
}

function text(content) {
  return new TextDisplayBuilder().setContent(truncate(content));
}

function separator(large = false, divider = true) {
  const sep = new SeparatorBuilder().setDivider(divider);

  if (typeof sep.setSpacing === 'function' && SeparatorSpacingSize) {
    sep.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
  }

  return sep;
}

function unixTime(timestamp, style = 'F') {
  if (!timestamp) return 'n/a';
  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}

function safeUrl(factory) {
  try {
    return factory() || null;
  } catch {
    return null;
  }
}

function safeSetEmoji(button, emoji) {
  const value = String(emoji || '').trim();
  if (!value) return button;

  try {
    button.setEmoji(value);
  } catch {
    // Invalid emoji should never break the command.
  }

  return button;
}

function formatFlagName(flag) {
  return String(flag || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getUserBadges(user) {
  const flags = user?.flags?.toArray?.() || [];
  if (!flags.length) return 'None detected';
  return flags.map(formatFlagName).join(', ');
}

function getRolePreview(member, max = 10) {
  if (!member) return 'Not in this server';

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);

  if (!roles.size) return 'No roles';

  const shown = roles.first(max).map((role) => `<@&${role.id}>`);
  const hidden = roles.size - shown.length;

  return hidden > 0
    ? `${shown.join(' ')}\n+ ${number(hidden)} more role${hidden === 1 ? '' : 's'}`
    : shown.join(' ');
}

function getTopRole(member) {
  if (!member) return 'n/a';

  const role = member.roles.highest;
  if (!role || role.id === member.guild.id) return 'No role';

  return `<@&${role.id}>`;
}

function getKeyPermissions(member) {
  if (!member) return 'Not in this server';

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return '`Administrator`';
  }

  const checks = [
    ['Manage Server', PermissionFlagsBits.ManageGuild],
    ['Manage Roles', PermissionFlagsBits.ManageRoles],
    ['Manage Channels', PermissionFlagsBits.ManageChannels],
    ['Manage Messages', PermissionFlagsBits.ManageMessages],
    ['Kick Members', PermissionFlagsBits.KickMembers],
    ['Ban Members', PermissionFlagsBits.BanMembers],
    ['Moderate Members', PermissionFlagsBits.ModerateMembers],
    ['Mention Everyone', PermissionFlagsBits.MentionEveryone],
    ['Manage Webhooks', PermissionFlagsBits.ManageWebhooks],
    ['Manage Emojis', PermissionFlagsBits.ManageGuildExpressions]
  ];

  const found = checks
    .filter(([, permission]) => member.permissions.has(permission))
    .map(([label]) => `\`${label}\``);

  return found.length ? found.join(', ') : 'Standard member permissions';
}

function getMemberStatus(member) {
  if (!member) return 'Not in this server';

  const items = [];

  if (member.pending) items.push('Pending screening');
  if (member.premiumSinceTimestamp) {
    items.push(`Boosting since ${unixTime(member.premiumSinceTimestamp, 'R')}`);
  }

  if (
    member.communicationDisabledUntilTimestamp &&
    member.communicationDisabledUntilTimestamp > Date.now()
  ) {
    items.push(`Timed out until ${unixTime(member.communicationDisabledUntilTimestamp, 'F')}`);
  }

  return items.length ? items.join('\n') : 'Active member';
}

function getAccentColor(user, member) {
  if (member?.displayColor && member.displayColor !== 0) return member.displayColor;
  if (typeof user?.accentColor === 'number') return user.accentColor;
  return DEFAULT_ACCENT;
}

async function resolveTarget({ client, message, args }) {
  const query = args.join(' ').trim();

  if (!query) {
    return {
      member: message.member,
      user: message.author
    };
  }

  let member = await resolveMember(message.guild, query).catch(() => null);
  let user = member?.user || await resolveUser(client, query).catch(() => null);

  if (user && !member) {
    member = await message.guild.members.fetch(user.id).catch(() => null);
  }

  return {
    member,
    user
  };
}

async function fetchFullUser(client, user) {
  if (!user?.id) return user;

  return client.users.fetch(user.id, { force: true }).catch(() => user);
}

function buildButtonRow({ user, avatarUrl, serverAvatarUrl, bannerUrl }) {
  const buttons = [];

  const typeButton = new ButtonBuilder()
    .setCustomId(`userinfo:type:${user.id}`)
    .setLabel(user.bot ? 'Bot Account' : 'User Account')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  safeSetEmoji(typeButton, user.bot ? icon('robot') : icon('user'));
  buttons.push(typeButton);

  buttons.push(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Profile')
      .setURL(`https://discord.com/users/${user.id}`)
  );

  if (avatarUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Avatar')
        .setURL(avatarUrl)
    );
  }

  if (serverAvatarUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Server Avatar')
        .setURL(serverAvatarUrl)
    );
  }

  if (bannerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Banner')
        .setURL(bannerUrl)
    );
  }

  return new ActionRowBuilder().addComponents(buttons.slice(0, 5));
}

function makePayload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
}

async function sendComponents(message, payload) {
  const interaction = message.interaction;

  if (interaction?.isChatInputCommand?.()) {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload).catch(() => null);
      return interaction.fetchReply().catch(() => null);
    }

    if (interaction.replied) {
      return interaction.followUp(payload).catch(() => null);
    }

    await interaction.reply(payload).catch(() => null);
    return interaction.fetchReply().catch(() => null);
  }

  return message.channel.send(payload);
}

async function buildUserInfoPayload({ client, message, args }) {
  const { member, user } = await resolveTarget({ client, message, args });

  if (!user) return null;

  const fullUser = await fetchFullUser(client, user);

  const avatarUrl = safeUrl(() =>
    fullUser.displayAvatarURL({ size: 512, extension: 'png' })
  );

  const serverAvatarUrl = member
    ? safeUrl(() => member.avatarURL?.({ size: 512, extension: 'png' }))
    : null;

  const displayAvatarUrl = safeUrl(() =>
    member?.displayAvatarURL?.({ size: 512, extension: 'png' }) ||
    fullUser.displayAvatarURL({ size: 512, extension: 'png' })
  );

  const bannerUrl = safeUrl(() =>
    fullUser.bannerURL?.({ size: 1024, extension: 'png' })
  );

  const username = fullUser.tag || fullUser.username;
  const globalName = fullUser.globalName || 'None';
  const nickname = member?.nickname || 'None';
  const created = unixTime(fullUser.createdTimestamp, 'F');
  const createdRelative = unixTime(fullUser.createdTimestamp, 'R');
  const joined = member?.joinedTimestamp
    ? unixTime(member.joinedTimestamp, 'F')
    : 'Not in this server';

  const roleCount = member
    ? Math.max(0, member.roles.cache.size - 1)
    : 0;

  const roles = getRolePreview(member);
  const topRole = getTopRole(member);
  const badges = getUserBadges(fullUser);
  const keyPermissions = getKeyPermissions(member);
  const memberStatus = getMemberStatus(member);

  const container = new ContainerBuilder()
    .setAccentColor(getAccentColor(fullUser, member));

  if (bannerUrl) {
    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(bannerUrl)
          .setDescription(`${username} profile banner`)
      )
    );
  }

  if (displayAvatarUrl) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((display) =>
          display.setContent([
            `# ${withIcon('user', `${username} — User Information`)}`,
            '',
            `> ${fullUser.bot ? 'Bot account' : 'Discord user'} • Created ${createdRelative}`,
            '',
            `**Mention:** <@${fullUser.id}>`,
            `**ID:** \`${fullUser.id}\``
          ].join('\n'))
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(displayAvatarUrl)
            .setDescription(`${username} avatar`)
        )
    );
  } else {
    container.addTextDisplayComponents(text([
      `${withIcon('user', `${username} — User Information`)}`,
      '',
      `> ${fullUser.bot ? 'Bot account' : 'Discord user'} • Created ${createdRelative}`,
      '',
      `Mention: <@${fullUser.id}>`,
      `ID: \`${fullUser.id}\``
    ].join('\n')));
  }

  container
    .addSeparatorComponents(separator(true))
    .addTextDisplayComponents(text([
      `**Account Info**`,
      `• Username: ${username}`,
      `• Display Name: ${globalName}`,
      `• Bot: ${fullUser.bot ? 'Yes' : 'No'}`,
      `• System: ${fullUser.system ? 'Yes' : 'No'}`,
      `• Created: ${created}`,
      `• Badges: ${badges}`,
      '',
      `**Server Profile**`,
      `• Nickname: ${nickname}`,
      `• Joined: ${joined}`,
      `• Top Role: ${topRole}`,
      `• Roles: ${number(roleCount)}`,
      `• Status: ${memberStatus}`
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `**Roles**`,
      roles,
      '',
      `**Key Permissions**`,
      keyPermissions
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addActionRowComponents(buildButtonRow({
      user: fullUser,
      avatarUrl,
      serverAvatarUrl,
      bannerUrl
    }))
    .addSeparatorComponents(separator(false, false))
    .addTextDisplayComponents(text(
      `${withIcon('info', `Requested by ${message.member?.displayName || message.author.username}`)}`
    ));

  return makePayload(container);
}

async function sendLegacyUserInfo({ message, user, member }) {
  return respond.reply(message, 'info', null, {
    thumbnail: user.displayAvatarURL(),
    description: [
      `**User info**`,
      `**User:** ${user.tag || user.username}`,
      `**ID:** \`${user.id}\``,
      `**Bot:** \`${user.bot ? 'yes' : 'no'}\``,
      `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
      `**Joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'not in this server'}`,
      `**Roles:** \`${member ? Math.max(0, member.roles.cache.size - 1) : 0}\``
    ].join('\n')
  });
}

module.exports = {
  name: 'userinfo',
  aliases: ['ui', 'whois'],
  category: 'utility',
  description: 'Shows detailed user profile and server membership data.',
  usage: 'userinfo [user]',
  examples: ['userinfo @user', 'userinfo 123456789012345678'],
  guildOnly: true,

  async execute({ client, message, args }) {
    if (!message.guild) {
      return respond.reply(message, 'bad', 'This command can only be used in a server.');
    }

    const { member, user } = await resolveTarget({ client, message, args });

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    if (!MessageFlags?.IsComponentsV2 || !ContainerBuilder || !TextDisplayBuilder) {
      return sendLegacyUserInfo({ message, user, member });
    }

    const payload = await buildUserInfoPayload({ client, message, args }).catch(() => null);

    if (!payload) {
      return respond.reply(message, 'bad', 'I could not load that user profile.');
    }

    return sendComponents(message, payload).catch(() =>
      respond.reply(message, 'bad', 'I could not send the user information panel here.')
    );
  }
};