const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  fetchBuffer,
  attachmentFromBuffer,
  firstAttachment,
  makeCaptionedImage,
  makeEditedImage
} = require('../../utils/media');
const { extractId } = require('../../utils/resolveUser');

const URL_REGEX = /(https?:\/\/[^\s<>)]+)/i;

const FONT_ALIASES = {
  default: 'Arial',
  sans: 'Arial',
  bold: 'Arial Black',
  mono: 'Courier New',
  serif: 'Times New Roman'
};

const EDIT_OPERATIONS = new Set([
  'blur',
  'brightness',
  'caption',
  'contrast',
  'deepfry',
  'flip',
  'gif',
  'glitch',
  'grayscale',
  'invert',
  'jail-bars',
  'pixelate',
  'resize',
  'rotate',
  'vaporwave',
  'wasted'
]);

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

function looksLikeMediaUrl(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();

  return clean.endsWith('.png') ||
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.webp') ||
    clean.endsWith('.gif') ||
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.includes('media.tenor.com');
}

function filenameFromUrl(url, fallback = 'media.png') {
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

function parseCaptionOptions(args) {
  const options = {
    position: 'top',
    fontFamily: FONT_ALIASES.default,
    fontColor: '#111111',
    backgroundColor: '#ffffff',
    fontSize: null
  };

  const remaining = [];

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      remaining.push(arg);
      continue;
    }

    const [rawKey, ...rest] = arg.slice(2).split('=');
    const key = String(rawKey || '').toLowerCase();
    const value = rest.join('=').trim();

    if (!value) {
      remaining.push(arg);
      continue;
    }

    if (key === 'position' && ['top', 'bottom'].includes(value.toLowerCase())) {
      options.position = value.toLowerCase();
      continue;
    }

    if ((key === 'font' || key === 'family') && value) {
      options.fontFamily = FONT_ALIASES[value.toLowerCase()] || value.slice(0, 120);
      continue;
    }

    if ((key === 'color' || key === 'text') && /^#?[0-9a-f]{6}$/i.test(value)) {
      options.fontColor = value.startsWith('#') ? value : `#${value}`;
      continue;
    }

    if ((key === 'bg' || key === 'background') && /^#?[0-9a-f]{6}$/i.test(value)) {
      options.backgroundColor = value.startsWith('#') ? value : `#${value}`;
      continue;
    }

    if ((key === 'size' || key === 'fontsize') && Number(value) > 0) {
      options.fontSize = Number(value);
      continue;
    }

    remaining.push(arg);
  }

  return { options, args: remaining };
}

function parseEditOptions(operation, args) {
  const raw = args.join(' ').trim();

  if (operation === 'resize') {
    const size = raw.match(/(\d{1,4})(?:x(\d{1,4}))?/i);

    return {
      width: size?.[1] ? Number(size[1]) : null,
      height: size?.[2] ? Number(size[2]) : null
    };
  }

  if (operation === 'rotate') return { degrees: Number(args[0] || 90) || 90 };

  if (['blur', 'brightness', 'contrast'].includes(operation)) {
    return { amount: Number(args[0] || 0) || undefined };
  }

  if (operation === 'pixelate') return { factor: Number(args[0] || 14) || 14 };

  return {};
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
  const response = await fetch(api).catch(() => null);

  if (!response?.ok) return null;

  const payload = await response.json().catch(() => null);
  const result = payload?.results?.[0];
  const formats = result?.media_formats || {};
  const picked = formats.gif?.url ||
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
  }).catch(() => null);

  if (!response?.ok) return null;

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

async function resolveMediaUrl(url) {
  if (!url) return null;

  if (isTenorUrl(url)) {
    if (String(url).includes('media.tenor.com')) {
      return {
        url,
        name: filenameFromUrl(url, 'tenor.gif'),
        contentType: contentTypeFromUrl(url) || 'image/gif'
      };
    }

    return (await resolveTenorWithApi(url)) || (await resolveTenorWithHtml(url));
  }

  if (!looksLikeMediaUrl(url)) return null;

  return {
    url,
    name: filenameFromUrl(url),
    contentType: contentTypeFromUrl(url)
  };
}

async function fetchMessageById(channel, id) {
  if (!id) return null;
  return channel.messages.fetch(id).catch(() => null);
}

async function resolveTargetMessage(message, args) {
  const explicitId = extractId(args[0]);

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

  const embedMedia = target.embeds?.find?.((embed) =>
    embed.image?.url ||
    embed.thumbnail?.url ||
    embed.video?.url ||
    embed.url
  );

  const embedUrl = embedMedia?.image?.url ||
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

async function sendMedia(message, attachment) {
  return respond.send(message.channel, 'info', message.author, null, {
    files: [attachment],
    allowedMentions: { parse: [] },
    mentionUser: false,
    plain: true,
    content: ''
  });
}

function help(prefix = ',') {
  return [
    `Use \`${prefix}media <operation> [url/message-id/reply] [options]\`.`,
    '',
    '**Popular examples**',
    `\`${prefix}media caption this is beautiful\``,
    `\`${prefix}media caption --position=bottom --font=bold text here\``,
    `\`${prefix}media gif https://tenor.com/view/example\``,
    `\`${prefix}media wasted\``,
    `\`${prefix}media resize 512x512\``,
    '',
    '**Tip:** Reply to an image, GIF, video, or Tenor link, then run the command.'
  ].join('\n');
}

module.exports = {
  name: 'media',
  aliases: ['m', 'message', 'msg'],
  category: 'media',
  description: 'Caption, export, and modify images, GIFs, videos, and Tenor media.',
  usage: 'media <caption|gif|blur|brightness|contrast|deepfry|flip|glitch|grayscale|invert|jail-bars|pixelate|resize|rotate|vaporwave|wasted> ...',
  examples: [
    'media caption meow',
    'media caption --position=bottom --font=bold cute',
    'media gif https://tenor.com/view/example',
    'media blur',
    'media resize 512x512',
    'media wasted'
  ],
  slash: true,
  subcommands: [
    {
      name: 'caption',
      aliases: ['cap'],
      description: 'Caption an image, GIF, video, or Tenor link.',
      usage: 'media caption [url] <text>',
      examples: ['media caption meow', 'media caption --position=bottom --font=bold cute'],
      flags: [
        { name: '--position=<top|bottom>', description: 'Caption placement.' },
        { name: '--font=<name>', description: 'Font family (aliases: --family).' },
        { name: '--color=<hex>', description: 'Text color hex (aliases: --text).' },
        { name: '--bg=<hex>', description: 'Background color hex (aliases: --background).' },
        { name: '--size=<px>', description: 'Font size (aliases: --fontsize).' }
      ]
    },
    {
      name: 'gif',
      aliases: ['exportgif'],
      description: 'Fetch and return the original GIF or media file.',
      usage: 'media gif [url]',
      examples: ['media gif', 'media gif https://tenor.com/view/example']
    },
    { name: 'blur', description: 'Blur an image.', usage: 'media blur [amount]', examples: ['media blur', 'media blur 3'] },
    { name: 'brightness', aliases: ['brighten'], description: 'Increase image brightness.', usage: 'media brightness [amount]', examples: ['media brightness', 'media brightness 1.4'] },
    { name: 'contrast', description: 'Increase image contrast.', usage: 'media contrast [amount]', examples: ['media contrast', 'media contrast 1.5'] },
    { name: 'deepfry', description: 'Apply a crispy deepfry effect.', usage: 'media deepfry', examples: ['media deepfry'] },
    { name: 'flip', description: 'Flip an image vertically.', usage: 'media flip', examples: ['media flip'] },
    { name: 'glitch', description: 'Apply a glitch overlay effect.', usage: 'media glitch', examples: ['media glitch'] },
    { name: 'grayscale', aliases: ['greyscale'], description: 'Convert an image to grayscale.', usage: 'media grayscale', examples: ['media grayscale'] },
    { name: 'invert', description: 'Invert image colors.', usage: 'media invert', examples: ['media invert'] },
    { name: 'jail-bars', aliases: ['jailbars'], description: 'Overlay jail bars on an image.', usage: 'media jail-bars', examples: ['media jail-bars'] },
    { name: 'pixelate', aliases: ['pixel'], description: 'Pixelate an image.', usage: 'media pixelate [factor]', examples: ['media pixelate', 'media pixelate 18'] },
    { name: 'resize', description: 'Resize an image to a target size.', usage: 'media resize <width>x<height>', examples: ['media resize 512x512', 'media resize 1024x768'] },
    { name: 'rotate', description: 'Rotate an image.', usage: 'media rotate [degrees]', examples: ['media rotate', 'media rotate 180'] },
    { name: 'vaporwave', description: 'Apply a vaporwave tint.', usage: 'media vaporwave', examples: ['media vaporwave'] },
    { name: 'wasted', description: 'Apply a wasted poster effect.', usage: 'media wasted', examples: ['media wasted'] },
    { name: 'help', description: 'Show media command usage.', usage: 'media help', examples: ['media help'] }
  ],
  guildOnly: true,
  botPermissions: [
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  async execute({ message, args, prefix }) {
    const sub = String(args.shift() || 'help').toLowerCase();

    if (sub === 'help') {
      return respond.reply(message, 'info', help(prefix || message.prefix || ','), {
        mentionUser: false
      });
    }

    if (!EDIT_OPERATIONS.has(sub)) {
      return respond.reply(message, 'info', help(prefix || message.prefix || ','), {
        mentionUser: false
      });
    }

    if (sub === 'caption') {
      const parsed = parseCaptionOptions(args);
      args.splice(0, args.length, ...parsed.args);

      let source = await getMediaSourceFromArgs(args);
      const target = source ? null : await resolveTargetMessage(message, args);

      if (!source && target) source = await getMediaSourceFromMessage(target);

      const caption = args.join(' ').trim();

      if (!caption || !source) {
        return respond.reply(message, 'info', 'I need an image, GIF, video, or Tenor link to caption.', {
          mentionUser: false
        });
      }

      const input = await fetchBuffer(source.url);
      const output = await makeCaptionedImage(
        input,
        caption,
        source.name || 'captioned.gif',
        source.contentType || '',
        parsed.options
      );

      return sendMedia(message, output);
    }

    let source = await getMediaSourceFromArgs(args);
    const target = source ? null : await resolveTargetMessage(message, args);

    if (!source && target) source = await getMediaSourceFromMessage(target);

    if (!source) {
      return respond.reply(message, 'info', 'I need an image, GIF, video, or Tenor link for that media command.', {
        mentionUser: false
      });
    }

    const input = await fetchBuffer(source.url);

    if (sub === 'gif') {
      return sendMedia(message, attachmentFromBuffer(input, source.name || 'media.gif'));
    }

    const output = await makeEditedImage(
      input,
      source.name || `${sub}.png`,
      sub,
      parseEditOptions(sub, args)
    );

    return sendMedia(message, output);
  }
};