const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  fetchBuffer,
  attachmentFromBuffer,
  firstAttachment,
  makeCaptionedImage
} = require('../../utils/media');
const { extractId } = require('../../utils/resolveUser');

const URL_REGEX = /(https?:\/\/[^\s<>)]+)/i;

function extractFirstUrl(text) {
  const match = String(text || '').match(URL_REGEX);
  return match ? match[1].replace(/[.,!?]+$/, '') : null;
}

function getGoogleKey() {
  return process.env.google || process.env.GOOGLE_API_KEY || '';
}

function isTenorUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('tenor.com');
  } catch {
    return false;
  }
}

function extractTenorId(url) {
  const clean = String(url || '').split('?')[0];
  const parts = clean.split('-');
  const last = parts[parts.length - 1];

  if (/^\d+$/.test(last)) return last;

  const match = clean.match(/\/view\/[^/]*?(\d{5,})/);
  return match?.[1] || null;
}

function looksLikeImageUrl(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();

  return (
    clean.endsWith('.png') ||
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.webp') ||
    clean.endsWith('.gif') ||
    clean.includes('media.tenor.com')
  );
}

function filenameFromUrl(url, fallback = 'captioned.gif') {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();

    if (last && /\.[a-z0-9]+$/i.test(last)) return last;
  } catch {}

  return fallback;
}

function contentTypeFromUrl(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();

  if (clean.endsWith('.gif') || clean.includes('media.tenor.com')) return 'image/gif';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.mp4')) return 'video/mp4';
  if (clean.endsWith('.webm')) return 'video/webm';

  return '';
}

function htmlDecode(value) {
  return String(value || '')
    .replaceAll('\\u002F', '/')
    .replaceAll('\\/', '/')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x2F;', '/');
}

async function resolveTenorWithApi(url) {
  const key = getGoogleKey();
  const id = extractTenorId(url);

  if (!key || !id) return null;

  const api = `https://tenor.googleapis.com/v2/posts?ids=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}&media_filter=gif,mediumgif,tinygif,webp,mp4&limit=1`;

  const response = await fetch(api);
  if (!response.ok) return null;

  const payload = await response.json();
  const result = payload?.results?.[0];
  const formats = result?.media_formats || {};

  const picked =
    formats.gif?.url ||
    formats.mediumgif?.url ||
    formats.tinygif?.url ||
    formats.webp?.url ||
    formats.mp4?.url;

  if (!picked) return null;

  return {
    url: picked,
    name: filenameFromUrl(picked, 'tenor.gif'),
    contentType: contentTypeFromUrl(picked) || 'image/gif'
  };
}

async function resolveTenorWithHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 Chrome/120 Safari/537.36',
      accept: 'text/html,*/*'
    }
  });

  if (!response.ok) return null;

  const html = htmlDecode(await response.text());

  const patterns = [
    /https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.gif(?:\?[^"'<>\\\s]+)?/gi,
    /https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.webp(?:\?[^"'<>\\\s]+)?/gi,
    /https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.mp4(?:\?[^"'<>\\\s]+)?/gi
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern)?.[0];

    if (match) {
      return {
        url: match,
        name: filenameFromUrl(match, 'tenor.gif'),
        contentType: contentTypeFromUrl(match)
      };
    }
  }

  return null;
}

async function resolveTenorUrl(url) {
  if (!isTenorUrl(url)) return null;

  if (String(url).includes('media.tenor.com')) {
    return {
      url,
      name: filenameFromUrl(url, 'tenor.gif'),
      contentType: contentTypeFromUrl(url) || 'image/gif'
    };
  }

  return (await resolveTenorWithApi(url)) || (await resolveTenorWithHtml(url));
}

async function resolveMediaUrl(url) {
  if (!url) return null;

  if (isTenorUrl(url)) {
    return resolveTenorUrl(url);
  }

  if (looksLikeImageUrl(url)) {
    return {
      url,
      name: filenameFromUrl(url),
      contentType: contentTypeFromUrl(url)
    };
  }

  return null;
}

async function fetchMessageById(channel, id) {
  if (!id) return null;
  return channel.messages.fetch(id).catch(() => null);
}

async function resolveTargetMessage(message, args) {
  const first = args[0];
  const explicitId = extractId(first);

  if (explicitId) {
    const target = await fetchMessageById(message.channel, explicitId);

    if (target) {
      args.shift();
      return target;
    }
  }

  if (message.reference?.messageId) {
    const replied = await fetchMessageById(message.channel, message.reference.messageId);
    if (replied) return replied;
  }

  return message;
}

async function getMediaSourceFromMessage(target) {
  const attachment = firstAttachment(target);

  if (attachment) {
    return {
      url: attachment.url,
      name: attachment.name || 'attachment.png',
      contentType: attachment.contentType || ''
    };
  }

  const embedMedia = target.embeds?.find?.((embed) => {
    return embed.image?.url || embed.thumbnail?.url || embed.video?.url || embed.url;
  });

  const embedUrl =
    embedMedia?.image?.url ||
    embedMedia?.thumbnail?.url ||
    embedMedia?.video?.url ||
    embedMedia?.url ||
    null;

  if (embedUrl) {
    const resolved = await resolveMediaUrl(embedUrl);
    if (resolved) return resolved;
  }

  const contentUrl = extractFirstUrl(target.content);

  if (contentUrl) {
    const resolved = await resolveMediaUrl(contentUrl);
    if (resolved) return resolved;
  }

  return null;
}

async function getMediaSourceFromArgs(args) {
  const firstUrl = extractFirstUrl(args[0]);

  if (!firstUrl) return null;

  const resolved = await resolveMediaUrl(firstUrl);

  if (!resolved) return null;

  args.shift();

  return resolved;
}

module.exports = {
  name: 'media',
  aliases: ['m', 'message', 'msg'],
  category: 'media',
  description: 'Caption an image, GIF, or Tenor link.',
  usage: 'media <caption|gif> ...',
  examples: [
    'media caption meow',
    'media caption https://tenor.com/view/example meow',
    'media caption https://cdn.discordapp.com/file.gif meow'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();

    if (sub === 'caption') {
      let source = await getMediaSourceFromArgs(args);
      const target = source ? null : await resolveTargetMessage(message, args);

      if (!source && target) {
        source = await getMediaSourceFromMessage(target);
      }

      const caption = args.join(' ').trim();

      if (!caption || !source) {
        return respond.reply(
          message,
          'info',
          'need an image, GIF, or Tenor link to caption.'
        );
      }

      const input = await fetchBuffer(source.url);

      const output = await makeCaptionedImage(
        input,
        caption,
        source.name || 'captioned.gif',
        source.contentType || ''
      );

      return message.channel.send({
        files: [output],
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'gif') {
      let source = await getMediaSourceFromArgs(args);
      const target = source ? null : await resolveTargetMessage(message, args);

      if (!source && target) {
        source = await getMediaSourceFromMessage(target);
      }

      if (!source) {
        return respond.reply(message, 'info', 'need an image, GIF, or Tenor link.');
      }

      const input = await fetchBuffer(source.url);

      return message.channel.send({
        files: [attachmentFromBuffer(input, source.name || 'media.gif')],
        allowedMentions: { parse: [] }
      });
    }

    return respond.reply(message, 'info', 'need `media <caption|gif> ...`.');
  }
};