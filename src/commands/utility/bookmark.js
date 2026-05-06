const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractUrl } = require('../../services/google/tenor');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

function splitQueryAndPage(args) {
  const parts = [...args];
  const last = parts.at(-1);
  const page = /^\d+$/.test(String(last || '')) ? Math.max(1, Number(parts.pop())) : 1;
  return { page, query: parts.join(' ').trim() };
}

module.exports = {
  name: 'bookmark',
  aliases: ['bm', 'save'],
  category: 'utility',
  description: 'I save links or replied messages as bookmarks in Supabase.',
  usage: 'bookmark <add|list|edit|remove> ...',
  examples: ['bookmark add https://example.com useful', 'bookmark edit <id> new note', 'bookmark list'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'add').toLowerCase();

    if (sub === 'list') {
      const { page, query } = splitQueryAndPage(args);
      const perPage = 5;
      const rows = await db.listBookmarks(message.author.id, {
        limit: perPage,
        offset: (page - 1) * perPage,
        search: query
      }).catch(() => null);

      if (!rows) {
        return respond.reply(message, 'bad', 'I could not load your bookmarks because the database is currently unreachable.');
      }

      const lines = rows.map((row, index) => {
        const label = row.title || row.note || row.url || row.message_url;
        return `**${index + 1 + (page - 1) * perPage}.** ${label}\n${row.url || row.message_url || ''}\n\`${row.id}\``;
      });

      return respond.reply(message, 'info', lines.length ? `Bookmarks page ${page}${query ? ` for \`${query}\`` : ''}:\n\n${lines.join('\n\n')}` : 'I could not find any bookmarks for you.');
    }

    if (sub === 'remove' || sub === 'delete') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `bookmark remove <id>`.');
      const removed = await db.deleteBookmark(message.author.id, id).catch(() => null);
      if (!removed) return respond.reply(message, 'bad', 'I could not remove that bookmark.');
      return respond.reply(message, 'good', 'I removed that bookmark.');
    }

    if (sub === 'edit') {
      const id = args.shift();
      const note = args.join(' ').trim();
      if (!id || !note) return respond.reply(message, 'info', 'Use `bookmark edit <id> <new note>`.');
      const row = await db.updateBookmark(message.author.id, id, { note }).catch(() => null);
      if (!row) return respond.reply(message, 'bad', 'I could not update that bookmark.');
      return respond.reply(message, 'good', `Updated bookmark \`${row.id}\`.`);
    }

    if (sub === 'add') {
      const text = args.join(' ').trim();
      const access = await getPremiumAccessForMessage(message).catch(() => null);
      const saved = await db.listBookmarks(message.author.id, { limit: 100, offset: 0 }).catch(() => null);
      if (saved && saved.length >= (access?.limits?.bookmarkSlots || 75)) {
        return respond.reply(
          message,
          'bad',
          access?.hasUserPremium
            ? 'Your bookmark gallery is full right now.'
            : 'Free users can save up to 75 bookmarks. User premium removes that limit.'
        );
      }

      let url = extractUrl(text);
      let messageUrl = null;
      let note = text;

      if (!url && message.reference?.messageId) {
        messageUrl = `https://discord.com/channels/${message.guild?.id || '@me'}/${message.channel.id}/${message.reference.messageId}`;
        note = text || 'Replied message';
      }

      if (url) {
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) url = null;
        } catch {
          url = null;
        }
      }

      if (!url && !messageUrl) {
        return respond.reply(message, 'info', 'Use `bookmark add <url> [note]` or reply to a message with `bookmark add`.');
      }

      const row = await db.addBookmark({
        user_id: message.author.id,
        guild_id: message.guild?.id || null,
        url,
        message_url: messageUrl,
        note
      }).catch(() => null);

      if (!row) {
        return respond.reply(message, 'bad', 'I could not save that bookmark because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `I saved that bookmark: \`${row.id}\`.`);
    }

    return respond.reply(message, 'info', 'Use `bookmark add`, `bookmark list`, `bookmark edit`, or `bookmark remove`.');
  }
};
