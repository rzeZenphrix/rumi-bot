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

module.exports = {
  name: 'channel',
  aliases: ['ch'],
  category: 'moderation',
  description: 'Create, delete, rename, or move channels.',
  usage: 'channel <create|delete|rename|move> ...',
  examples: [
    'channel create text general-chat',
    'channel delete #old-channel',
    'channel rename #general main-chat',
    'channel move #general 3'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const action = (args.shift() || '').toLowerCase();

    if (action === 'create') {
      const typeName = (args.shift() || 'text').toLowerCase();
      const name = clean(args, '');
      const type = TYPES[typeName];

      if (!type || !name) return info(message, 'Usage: `channel create <text|voice|category> <name>`.');

      const channel = await message.guild.channels.create({
        name,
        type,
        reason: `Channel created by ${message.author.tag}`
      });

      return ok(message, `Created ${channel.name}.`);
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