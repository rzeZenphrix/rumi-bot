const respond = require('../../utils/respond');
const { requireUserPremium } = require('../../systems/monetization/access');
const { findSavedGif, getGallery, removeSavedGif, upsertSavedGif } = require('../../systems/monetization/saveGifStore');
const { fetchBuffer, firstAttachment, attachmentFromBuffer } = require('../../utils/media');
const { extractUrl, resolveTenorUrl } = require('../../services/google/tenor');

const SUPPORTED_TYPES = new Set([
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm'
]);

function parseMode(args) {
  const sub = String(args[0] || '').toLowerCase();
  if (['add', 'list', 'send', 'remove', 'delete'].includes(sub)) {
    return {
      mode: sub,
      rest: args.slice(1)
    };
  }

  return {
    mode: 'add',
    rest: args
  };
}

async function referencedMessage(message) {
  if (!message.reference?.messageId) return null;
  return message.channel.messages.fetch(message.reference.messageId).catch(() => null);
}

async function resolveSource(message, fallbackUrl) {
  const reply = await referencedMessage(message);
  const attachment = firstAttachment(message) || firstAttachment(reply);
  if (attachment?.url) {
    return {
      sourceUrl: attachment.url,
      resolvedUrl: attachment.url,
      contentType: attachment.contentType || null,
      originalName: attachment.name || 'saved-media'
    };
  }

  const rawUrl = fallbackUrl || extractUrl(reply?.content || '');
  if (!rawUrl) return null;

  const tenor = await resolveTenorUrl(rawUrl).catch(() => null);
  if (tenor?.url) {
    return {
      sourceUrl: rawUrl,
      resolvedUrl: tenor.url,
      contentType: tenor.contentType || 'image/gif',
      originalName: tenor.name || 'tenor.gif'
    };
  }

  return {
    sourceUrl: rawUrl,
    resolvedUrl: rawUrl,
    contentType: null,
    originalName: 'saved-media'
  };
}

module.exports = {
  name: 'savegif',
  aliases: ['gifsave', 'gifgallery'],
  category: 'utility',
  description: 'Save personal GIFs and media clips in a reusable gallery.',
  usage: 'savegif <name> | savegif <add|list|send|remove> ...',
  examples: ['savegif dance', 'savegif add wave', 'savegif list', 'savegif send dance'],
  typing: true,

  async execute({ message, args }) {
    const access = await requireUserPremium(message, 'Save GIF gallery').catch(() => null);
    if (!access) return null;

    const parsed = parseMode(args);

    if (parsed.mode === 'list') {
      const gallery = await getGallery(message.author.id);
      const limit = access.limits.saveGifSlots || 50;
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: gallery.items.length
          ? `**Saved GIFs (${gallery.items.length}/${limit})**\n${gallery.items.map((item, index) => `${index + 1}. \`${item.name}\``).join('\n')}`
          : `You do not have any saved GIFs yet.\n\nYou have **${limit}** slots with user premium.`
      });
    }

    if (parsed.mode === 'remove' || parsed.mode === 'delete') {
      const name = parsed.rest.join(' ').trim();
      if (!name) return respond.reply(message, 'info', 'Use `savegif remove <name>`.');
      const removed = await removeSavedGif(message.author.id, name);
      if (!removed) return respond.reply(message, 'bad', 'I could not find a saved GIF by that name.');
      return respond.reply(message, 'good', `Removed \`${removed.name}\` from your gallery.`);
    }

    if (parsed.mode === 'send') {
      const name = parsed.rest.join(' ').trim();
      if (!name) return respond.reply(message, 'info', 'Use `savegif send <name>`.');
      const saved = await findSavedGif(message.author.id, name);
      if (!saved) return respond.reply(message, 'bad', 'I could not find a saved GIF by that name.');

      const buffer = await fetchBuffer(saved.resolvedUrl || saved.sourceUrl, {
        maxBytes: Number(process.env.SAVEGIF_MAX_BYTES || 16 * 1024 * 1024)
      }).catch(() => null);
      if (!buffer) {
        return respond.reply(message, 'bad', 'I could not fetch that saved media right now.');
      }

      await message.channel.send({
        files: [attachmentFromBuffer(buffer, saved.originalName || `${saved.name}.gif`)],
        allowedMentions: { parse: [] }
      });
      return null;
    }

    const name = String(parsed.rest[0] || '').trim();
    if (!name) {
      return respond.reply(message, 'info', 'Use `savegif <name>` or reply to a message with `savegif <name>`.');
    }

    const gallery = await getGallery(message.author.id);
    const existing = await findSavedGif(message.author.id, name);
    if (!existing && gallery.items.length >= (access.limits.saveGifSlots || 50)) {
      return respond.reply(message, 'bad', 'Your GIF gallery is full. User premium includes up to 50 saved GIF slots.');
    }

    const fallbackUrl = extractUrl(parsed.rest.slice(1).join(' '));
    const source = await resolveSource(message, fallbackUrl);
    if (!source) {
      return respond.reply(message, 'info', 'Attach a GIF/media file, provide a URL, or reply to a message with media when using `savegif <name>`.');
    }

    if (source.contentType && !SUPPORTED_TYPES.has(String(source.contentType).toLowerCase())) {
      return respond.reply(message, 'bad', 'I can only save GIF, WEBP, MP4, or WEBM media for this gallery.');
    }

    const saved = await upsertSavedGif(message.author.id, {
      name,
      sourceUrl: source.sourceUrl,
      resolvedUrl: source.resolvedUrl,
      contentType: source.contentType,
      originalName: source.originalName
    });

    return respond.reply(message, 'good', `Saved \`${saved.name}\` to your gallery. Saved media still follows local server rules and moderation settings when you send it.`);
  }
};
