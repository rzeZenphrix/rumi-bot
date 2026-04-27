const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { fetchBuffer, firstAttachment, customEmojiInfo, cleanName } = require('../../utils/media');
const { extractId } = require('../../utils/resolveUser');

const MAX_EMOJI_BYTES = Number(process.env.EMOJI_MAX_BYTES || 256 * 1024);

async function resolveGuildEmoji(guild, input) {
  const custom = customEmojiInfo(input);
  const id = custom?.id || extractId(input);
  if (id) return guild.emojis.fetch(id).catch(() => null);
  const q = String(input || '').toLowerCase();
  return guild.emojis.cache.find((e) => e.name.toLowerCase() === q) || null;
}

async function addEmojiFromUrl(guild, name, url, reason) {
  const safeName = cleanName(name, 'emoji');
  if (guild.emojis.cache.some((emoji) => emoji.name.toLowerCase() === safeName.toLowerCase())) {
    throw new Error('duplicate_emoji_name');
  }

  const maxSlots = Number(guild.maximumEmojis || 50);
  if (guild.emojis.cache.size >= maxSlots) throw new Error('emoji_slots_full');

  const buffer = await fetchBuffer(url, { maxBytes: MAX_EMOJI_BYTES });
  return guild.emojis.create({ attachment: buffer, name: safeName, reason });
}

module.exports = {
  name: 'emoji',
  aliases: ['emote', 'emojis'],
  category: 'misc',
  description: 'Steal, add, remove, enlarge, export, list, or rename emojis.',
  usage: 'emoji <steal|add|remove|enlarge|export|list|rename> ...',
  examples: ['emoji steal <:blob:123456789012345678>', 'emoji add smile <attachment|url>', 'emoji remove smile', 'emoji export smile', 'emoji rename old new'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuildExpressions],
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  cooldown: 5,

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();

    if (sub === 'steal') {
      const inputs = args.length ? args : [...(message.content.matchAll(/<a?:\w{2,32}:\d{17,20}>/g))].map((m) => m[0]);
      const emojis = inputs.map(customEmojiInfo).filter(Boolean);
      if (!emojis.length) return respond.reply(message, 'info', 'Usage: `emoji steal <customEmoji> [more emojis...]`.');
      const added = [];
      const failed = [];
      for (const emoji of emojis.slice(0, 20)) {
        const created = await addEmojiFromUrl(message.guild, emoji.name, emoji.url, `Emoji stolen by ${message.author.tag}`).catch((error) => {
          failed.push(error.message);
          return null;
        });
        if (created) added.push(`${created}`);
      }
      return respond.reply(message, added.length ? 'good' : 'bad', `Stole **${added.length}** emoji(s)${failed.length ? ` and skipped **${failed.length}**` : ''}: ${added.join(' ') || 'none'}`);
    }

    if (sub === 'add') {
      const name = args.shift();
      const attachment = firstAttachment(message);
      const url = args.shift() || attachment?.url;
      if (!name || !url) return respond.reply(message, 'info', 'Usage: `emoji add <name> <attachment|url>`.');
      const created = await addEmojiFromUrl(message.guild, name, url, `Emoji added by ${message.author.tag}`).catch((error) => {
        if (error.message === 'duplicate_emoji_name') return 'duplicate';
        if (error.message === 'emoji_slots_full') return 'full';
        return null;
      });
      if (created === 'duplicate') return respond.reply(message, 'bad', `I couldn’t add that emoji because **${cleanName(name, 'emoji')}** already exists.`);
      if (created === 'full') return respond.reply(message, 'bad', 'I couldn’t add an emoji because this server has no emoji slots left.');
      if (!created) return respond.reply(message, 'bad', 'I couldn’t add that emoji. The image may be invalid, too large, or rejected by Discord.');
      return respond.reply(message, 'good', `Added emoji ${created} as **${created.name}**.`);
    }

    if (sub === 'remove' || sub === 'delete') {
      const emoji = await resolveGuildEmoji(message.guild, args.join(' '));
      if (!emoji) return respond.reply(message, 'info', 'Usage: `emoji remove <emoji|id|name>`.');
      const name = emoji.name;
      await emoji.delete(`Emoji removed by ${message.author.tag}`);
      return respond.reply(message, 'good', `Removed emoji **${name}**.`);
    }

    if (sub === 'enlarge' || sub === 'big') {
      const info = customEmojiInfo(args[0]);
      const emoji = info || await resolveGuildEmoji(message.guild, args[0]);
      const url = info?.url || emoji?.imageURL?.({ size: 4096, extension: emoji.animated ? 'gif' : 'png' });
      if (!url) return respond.reply(message, 'info', 'Usage: `emoji enlarge <customEmoji|id|name>`.');
      return respond.reply(message, 'info', null, { title: 'Enlarged emoji', description: `[Open image](${url})`, image: url });
    }

    if (sub === 'export' || sub === 'download') {
      const info = customEmojiInfo(args[0]);
      const emoji = info || await resolveGuildEmoji(message.guild, args[0]);
      const url = info?.url || emoji?.imageURL?.({ size: 4096, extension: emoji?.animated ? 'gif' : 'png' });
      const name = cleanName(info?.name || emoji?.name, 'emoji');

      if (!url || !name) {
        return respond.reply(message, 'info', 'Usage: `emoji export <customEmoji|id|name>`.');
      }

      const buffer = await fetchBuffer(url, { maxBytes: 2 * 1024 * 1024 }).catch(() => null);
      if (!buffer) {
        return respond.reply(message, 'bad', 'I could not download that emoji right now.');
      }

      const extension = emoji?.animated || info?.animated ? 'gif' : 'png';
      return message.channel.send({
        content: `Here is **${name}** in downloadable format.`,
        files: [new AttachmentBuilder(buffer, { name: `${name}.${extension}` })],
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'list') {
      const list = message.guild.emojis.cache.map((e) => `${e} \`:${e.name}:\``).join(' ');
      return respond.reply(message, 'info', null, { title: `Emojis (${message.guild.emojis.cache.size})`, description: list.slice(0, 4096) || 'No emojis found.' });
    }

    if (sub === 'rename') {
      const emoji = await resolveGuildEmoji(message.guild, args.shift());
      const name = cleanName(args.join('_'));
      if (!emoji || !name) return respond.reply(message, 'info', 'Usage: `emoji rename <emoji|id|oldName> <newName>`.');
      await emoji.setName(name, `Emoji renamed by ${message.author.tag}`);
      return respond.reply(message, 'good', `Renamed emoji to **${name}**.`);
    }

    return respond.reply(message, 'info', 'Usage: `emoji <steal|add|remove|enlarge|export|list|rename> ...`.');
  }
};
