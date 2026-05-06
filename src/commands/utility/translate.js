const respond = require('../../utils/respond');

const LANG_ALIASES = {
  eng: 'en',
  english: 'en',
  spanish: 'es',
  espanol: 'es',
  french: 'fr',
  german: 'de',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh-CN',
  chinese_simplified: 'zh-CN',
  chinese_traditional: 'zh-TW',
  portuguese: 'pt',
  brazilian: 'pt-BR'
};

function normalizeLanguage(input) {
  const clean = String(input || '').trim();
  if (!clean) return '';
  return LANG_ALIASES[clean.toLowerCase()] || clean;
}

async function fetchReplyText(message) {
  if (!message.reference?.messageId) return '';
  const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  return replied?.content?.trim() || '';
}

async function translateText(source, target, text) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source || 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return null;

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) return null;

  const translated = Array.isArray(payload[0])
    ? payload[0].map((part) => Array.isArray(part) ? part[0] : '').join('').trim()
    : '';

  const detectedSource = String(payload[2] || source || 'auto');
  return translated ? { translated, detectedSource } : null;
}

module.exports = {
  name: 'translate',
  aliases: ['tr'],
  category: 'utility',
  description: 'Translate text or a replied-to message.',
  usage: 'translate <target language> [text]',
  examples: ['translate es hello', 'translate ja i love ramen', 'translate fr', 'translate english bonjour'],
  subcommands: [
    {
      name: 'reply',
      aliases: ['message'],
      description: 'Translate the message you replied to.',
      usage: 'translate <target language>',
      examples: ['translate es']
    }
  ],

  async execute({ message, args }) {
    const target = normalizeLanguage(args.shift());
    let text = args.join(' ').trim();

    if (!target) {
      return respond.reply(message, 'info', 'Use `translate <target language> <text>` or reply to a message with `translate <target language>`.');
    }

    if (!text) {
      text = await fetchReplyText(message);
    }

    if (!text) {
      return respond.reply(message, 'info', 'Give me text to translate, or reply to a message and provide the target language.');
    }

    const result = await translateText('auto', target, text);
    if (!result?.translated) {
      return respond.reply(message, 'bad', 'Translation is unavailable right now, or that language pair did not return content.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        `**Target:** \`${target}\``,
        `**Detected source:** \`${result.detectedSource || 'auto'}\``,
        '',
        result.translated
      ].join('\n')
    });
  }
};
