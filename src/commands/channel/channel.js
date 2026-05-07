const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findChannel } = require('../../utils/moderationSimple');

const TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement
};

function takeFlagValue(args, names) {
  const index = args.findIndex((arg) => names.includes(String(arg || '').toLowerCase()));
  if (index === -1) return null;
  const value = args[index + 1] || '';
  args.splice(index, value ? 2 : 1);
  return value || null;
}

function channelLabel(channel) {
  if (!channel) return 'N/A';
  if (channel.type === ChannelType.GuildCategory) return `**${channel.name}**`;
  return `${channel}`;
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
      examples: ['channel create text announcements --category Info', 'channel create category Events']
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

      if (!type || !name) return info(message, 'Usage: `channel create <text|voice|category> <name> [--category <category>]`.');

      let parent = null;
      if (categoryInput && type !== ChannelType.GuildCategory) {
        parent = await findChannel(message.guild, categoryInput);
        if (!parent || parent.type !== ChannelType.GuildCategory) {
          return bad(message, 'I could not find that category.');
        }
      }

      const channel = await message.guild.channels.create({
        name: name.slice(0, 100),
        type,
        parent: parent?.id,
        reason: `Channel created by ${message.author.tag}`
      });

      return ok(message, `Created ${channelLabel(channel)}${parent ? ` in **${parent.name}**` : ''}.`);
    }

    if (action === 'delete') {
      const channel = await findChannel(message.guild, args.shift(), message.channel);
      if (!channel) return info(message, 'Usage: `channel delete [channel]`.');

      const name = channel.name;
      await channel.delete(`Channel deleted by ${message.author.tag}`);

      return ok(message, `Deleted ${name}.`);
    }

    if (action === 'rename') {
      const first = args.shift();
      const channel = await findChannel(message.guild, first, message.channel);
      const name = channel?.id === message.channel.id && !String(first || '').match(/\d{17,20}|^#/)
        ? clean([first, ...args], '')
        : clean(args, '');

      if (!channel || !name) return info(message, 'Usage: `channel rename [channel] <new name>`.');

      await channel.setName(name.slice(0, 100), `Channel renamed by ${message.author.tag}`);
      return ok(message, `Renamed channel to ${channel.name}.`);
    }

    if (action === 'move') {
      const channel = await findChannel(message.guild, args.shift(), message.channel);
      const target = args.join(' ').trim();

      if (!channel || !target) return info(message, 'Usage: `channel move [channel] <position|category>`.');

      const position = Number(target);
      if (Number.isInteger(position)) {
        await channel.setPosition(position, { reason: `Channel moved by ${message.author.tag}` });
        return ok(message, `Moved ${channel.name} to position ${position}.`);
      }

      const category = await findChannel(message.guild, target);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return bad(message, 'Category not found.');
      }

      await channel.setParent(category.id, { reason: `Channel moved by ${message.author.tag}` });
      return ok(message, `Moved ${channel.name} to ${category.name}.`);
    }

    return info(message, 'Usage: `channel <create|delete|rename|move> ...`.');
  }
};
