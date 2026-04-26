const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractUrl } = require('../../services/google/tenor');

module.exports = {
  name: 'bookmark',
  aliases: ['bm', 'save'],
  category: 'utility',
  description: 'I save links or replied messages as bookmarks in Supabase.',
  usage: 'bookmark <add|list|remove> ...',
  examples: ['bookmark add https://example.com useful', 'bookmark add', 'bookmark list'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'add').toLowerCase();

    if (sub === 'list') {
      const rows = await db.listBookmarks(message.author.id);
      const lines = rows.map((row, index) => `${index + 1}. ${row.title || row.note || row.url || row.message_url}\n${row.url || row.message_url || ''}\n\`${row.id}\``);
      return respond.reply(message, 'info', lines.length ? `I found your bookmarks:\n${lines.join('\n')}` : 'I could not find any bookmarks for you.');
    }

    if (sub === 'remove' || sub === 'delete') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `bookmark remove <id>`.');
      await db.deleteBookmark(message.author.id, id);
      return respond.reply(message, 'good', 'I removed that bookmark.');
    }

    if (sub === 'add') {
      const text = args.join(' ').trim();
      let url = extractUrl(text);
      let messageUrl = null;
      let note = text;

      if (!url && message.reference?.messageId) {
        messageUrl = `https://discord.com/channels/${message.guild?.id || '@me'}/${message.channel.id}/${message.reference.messageId}`;
        note = text || 'Replied message';
      }

      if (!url && !messageUrl) return respond.reply(message, 'info', 'Use `bookmark add <url> [note]` or reply to a message with `bookmark add`.');

      const row = await db.addBookmark({ user_id: message.author.id, guild_id: message.guild?.id || null, url, message_url: messageUrl, note });
      return respond.reply(message, 'good', `I saved that bookmark: \`${row.id}\`.`);
    }

    return respond.reply(message, 'info', 'Use `bookmark add`, `bookmark list`, or `bookmark remove`.');
  }
};
