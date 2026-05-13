const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const respond = require('../../utils/respond');

const TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement
};

function clean(args, fallback = '') {
  const text = Array.isArray(args) ? args.join(' ').trim() : String(args || '').trim();
  return text || fallback;
}

function extractId(input) {
  return String(input || '').match(/\d{17,20}/)?.[0] || null;
}

function takeFlagValue(args, names) {
  const index = args.findIndex((arg) => names.includes(String(arg || '').toLowerCase()));
  if (index === -1) return null;

  const value = args[index + 1] || '';
  args.splice(index, value ? 2 : 1);

  return value || null;
}

async function findChannel(guild, input, fallback = null) {
  const raw = String(input || '').trim();

  if (!raw) return fallback;

  const id = extractId(raw);
  if (id) {
    return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);
  }

  const query = raw.toLowerCase().replace(/^#/, '');

  return guild.channels.cache.find((channel) =>
    channel.name.toLowerCase() === query ||
    channel.name.toLowerCase().includes(query)
  ) || null;
}

function channelLabel(channel) {
  if (!channel) return 'N/A';
  if (channel.type === ChannelType.GuildCategory) return `**${channel.name}**`;
  return `${channel}`;
}

function isLikelyChannelInput(input) {
  const raw = String(input || '').trim();
  return /^<#\d{17,20}>$/.test(raw) || /^\d{17,20}$/.test(raw) || raw.startsWith('#');
}

async function resolveChannelAndRest(guild, args, fallbackChannel) {
  const first = args[0];

  if (!first) {
    return {
      channel: fallbackChannel,
      rest: []
    };
  }

  if (isLikelyChannelInput(first)) {
    const channel = await findChannel(guild, first, null);
    return {
      channel,
      rest: args.slice(1)
    };
  }

  const maybeChannel = await findChannel(guild, first, null);

  if (maybeChannel) {
    return {
      channel: maybeChannel,
      rest: args.slice(1)
    };
  }

  return {
    channel: fallbackChannel,
    rest: args
  };
}

function shortChannelType(channel) {
  if (!channel) return 'channel';
  if (channel.type === ChannelType.GuildText) return 'text channel';
  if (channel.type === ChannelType.GuildVoice) return 'voice channel';
  if (channel.type === ChannelType.GuildStageVoice) return 'stage channel';
  if (channel.type === ChannelType.GuildForum) return 'forum channel';
  if (channel.type === ChannelType.GuildCategory) return 'category';
  if (channel.type === ChannelType.GuildAnnouncement) return 'announcement channel';
  return 'channel';
}

async function askDeleteConfirmation(message, channel) {
  const embed = new EmbedBuilder()
    .setDescription([
      `Delete ${shortChannelType(channel)} ${channelLabel(channel)}?`,
      '',
      'This cannot be undone.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`channel_delete_confirm:${message.id}:${channel.id}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`channel_delete_cancel:${message.id}:${channel.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const prompt = await message.channel.send({
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] }
  });

  const collector = prompt.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (interaction) => interaction.user.id === message.author.id
  });

  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate().catch(() => null);

      if (interaction.customId.startsWith('channel_delete_cancel:')) {
        collector.stop('cancelled');

        await prompt.edit({
          embeds: [new EmbedBuilder().setDescription('Channel delete cancelled.')],
          components: []
        }).catch(() => null);

        return resolve(false);
      }

      collector.stop('confirmed');

      await prompt.edit({
        embeds: [new EmbedBuilder().setDescription(`Deleting ${channelLabel(channel)}...`)],
        components: []
      }).catch(() => null);

      return resolve(true);
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'confirmed' || reason === 'cancelled') return;

      await prompt.edit({
        embeds: [new EmbedBuilder().setDescription('Channel delete confirmation expired.')],
        components: []
      }).catch(() => null);

      resolve(false);
    });
  });
}

module.exports = {
  name: 'channel',
  aliases: ['ch'],
  category: 'channel',
  description: 'Create, delete, rename, or move channels.',
  usage: 'channel <create|delete|rename|move> ...',
  examples: [
    'channel create text general-chat',
    'channel create voice Lounge --category Social',
    'channel create category Social',
    'channel delete #old-channel',
    'channel rename #general main-chat',
    'channel move #general 3'
  ],
  subcommands: [
    {
      name: 'create',
      description: 'Create a text, voice, category, stage, forum, or announcement channel.',
      usage: 'channel create <text|voice|category|stage|forum|announcement> <name> [--category <category>]',
      examples: ['channel create text announcements --category Info', 'channel create category Events'],
      flags: [
        { name: '--category <category>', description: 'Place the new channel under a category.' }
      ]
    },
    {
      name: 'delete',
      description: 'Delete a channel.',
      usage: 'channel delete [channel]',
      examples: ['channel delete #old-channel']
    },
    {
      name: 'rename',
      description: 'Rename a channel.',
      usage: 'channel rename [channel] <new name>',
      examples: ['channel rename #general main-chat']
    },
    {
      name: 'move',
      description: 'Move a channel to a position or category.',
      usage: 'channel move [channel] <position|category>',
      examples: ['channel move #general 3', 'channel move #chat Social']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const action = (args.shift() || '').toLowerCase();

    if (action === 'create') {
      const typeName = (args.shift() || 'text').toLowerCase();
      const categoryInput = takeFlagValue(args, ['--category', '-c']);
      const name = clean(args, '');
      const type = TYPES[typeName];

      if (!type || !name) {
        return respond.reply(message, '', '> Create a channel.\n \n```Syntax: channel create <text|voice|category> <name> [--category <category>]\nExample: channel create text general-chat```\n-# Tip:\n> Use **--category** to place the new channel under an existing category.', {
          mentionUser: false
        });
      }

      let parent = null;

      if (categoryInput && type !== ChannelType.GuildCategory) {
        parent = await findChannel(message.guild, categoryInput);

        if (!parent || parent.type !== ChannelType.GuildCategory) {
          return respond.reply(message, 'bad', 'I could not find that category.', {
            mentionUser: false
          });
        }
      }

      const channel = await message.guild.channels.create({
        name: name.slice(0, 100),
        type,
        parent: parent?.id || undefined,
        reason: `Channel created by ${message.author.tag}`
      });

      return respond.reply(
        message,
        'good',
        `Created **${channelLabel(channel)}**${parent ? ` in **${parent.name}**` : ''}.`,
        { mentionUser: false }
      );
    }

    if (action === 'delete') {
      const { channel } = await resolveChannelAndRest(message.guild, args, message.channel);

      if (!channel) {
        return respond.reply(message, '', '> Delete a channel.\n \n```Syntax: channel delete [channel]\nExample: channel delete #general-chat```', {
          mentionUser: false
        });
      }

      const confirmed = await askDeleteConfirmation(message, channel);
      if (!confirmed) return null;

      const name = channel.name;
      const deletingCurrentChannel = channel.id === message.channel.id;

      await channel.delete(`Channel deleted by ${message.author.tag}`);

      if (!deletingCurrentChannel) {
        return respond.reply(message, 'bin', `Deleted **${name}**.`, {
          mentionUser: false
        });
      }

      return null;
    }

    if (action === 'rename') {
      const { channel, rest } = await resolveChannelAndRest(message.guild, args, message.channel);
      const name = clean(rest, '');

      if (!channel || !name) {
        return respond.reply(message, '', '> **Rename a channel.**\n \n```Syntax: channel rename [channel] <new name>\nExample: channel rename #general-chat main-chat```', {
          mentionUser: false
        });
      }

      await channel.setName(name.slice(0, 100), `Channel renamed by ${message.author.tag}`);

      return respond.reply(message, 'edit', `Renamed channel to **${channel.name}**.`, {
        mentionUser: false
      });
    }

    if (action === 'move') {
      const { channel, rest } = await resolveChannelAndRest(message.guild, args, message.channel);
      const target = clean(rest, '');

      if (!channel || !target) {
        return respond.reply(message, '', '> Move a channel to a position or category.\n \n```Syntax: channel move [channel] <position|category>\nExample: channel move #general-chat 5```', {
          mentionUser: false
        });
      }

      const position = Number(target);

      if (Number.isInteger(position)) {
        await channel.setPosition(position, {
          reason: `Channel moved by ${message.author.tag}`
        });

        return respond.reply(message, 'good', `Moved **${channel.name}** to position **${position}**.`, {
          mentionUser: false
        });
      }

      const category = await findChannel(message.guild, target);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return respond.reply(message, 'bad', 'Category not found.', {
          mentionUser: false
        });
      }

      await channel.setParent(category.id, {
        reason: `Channel moved by ${message.author.tag}`
      });

      return respond.reply(message, 'good', `Moved **${channel.name}** to **${category.name}**.`, {
        mentionUser: false
      });
    }

    return respond.reply(
      message, '', '> Create, delete, rename, or move channels.\n \n```Syntax: channel <create|delete|rename|move>\nExamples:\nchannel create text announcements --category Info\nchannel delete #old-channel\nchannel rename #general main-chat\nchannel move #general 3```',
      { mentionUser: false }
    );
  }
};