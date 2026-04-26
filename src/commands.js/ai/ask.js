const { askGemini } = require('../../services/google/gemini');

const userCooldowns = new Map();
const lastPrompts = new Map();

const COOLDOWN_MS = Number(process.env.ASK_COOLDOWN_MS || 8000);
const MAX_PROMPT_LENGTH = Number(process.env.ASK_MAX_PROMPT_LENGTH || 1800);
const MAX_OUTPUT_CHUNK = 1900;

function neutralizeMentions(text) {
  return String(text || '')
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .replace(/<@&/g, '<@\u200b&')
    .replace(/<@/g, '<@\u200b');
}

function hasMassPing(text) {
  return /@everyone|@here|<@&?\d+>|<@!?\d+>/i.test(String(text || ''));
}

function hasSpamPattern(text) {
  const clean = String(text || '').trim();

  if (clean.length > MAX_PROMPT_LENGTH) return true;
  if (/(.)\1{18,}/i.test(clean)) return true;

  const words = clean.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length >= 12) {
    const counts = new Map();

    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
      if (counts.get(word) >= 10) return true;
    }
  }

  const links = clean.match(/https?:\/\//gi);
  if (links && links.length >= 4) return true;

  return false;
}

function isLowEffortTroll(text) {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const blocked = [
    'say the n word',
    'say n word',
    'say a slur',
    'ping everyone',
    'spam everyone',
    'mass ping',
    'bypass filter',
    'ignore all rules',
    'ignore your rules'
  ];

  return blocked.some((phrase) => clean === phrase || clean.includes(phrase));
}

function getCooldownRemaining(userId) {
  const now = Date.now();
  const last = userCooldowns.get(userId) || 0;
  const remaining = last + COOLDOWN_MS - now;

  if (remaining > 0) return remaining;

  userCooldowns.set(userId, now);
  return 0;
}

function isRepeatedPrompt(userId, prompt) {
  const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
  const previous = lastPrompts.get(userId);

  lastPrompts.set(userId, normalized);

  return previous && previous === normalized;
}

function splitMessage(text, max = MAX_OUTPUT_CHUNK) {
  const safe = neutralizeMentions(text || '').trim();

  if (!safe) return ['I could not generate a useful response for that.'];

  const chunks = [];
  let remaining = safe;

  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);

    if (cut < 800) cut = remaining.lastIndexOf('. ', max);
    if (cut < 800) cut = remaining.lastIndexOf(' ', max);
    if (cut < 800) cut = max;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);

  return chunks;
}

async function sendPlain(channel, text) {
  return channel.send({
    content: neutralizeMentions(text),
    allowedMentions: { parse: [] }
  });
}

module.exports = {
  name: 'ask',
  aliases: ['ai', 'rumi'],
  category: 'ai',
  description: 'Ask Rumi AI a question.',
  usage: 'ask question',
  examples: [
    'ask am I a fat chud?',
    'ai is ria a fat chud?'
  ],

  async execute({ message, args }) {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      return sendPlain(message.channel, 'Ask me a question and I’ll try to help.');
    }

    const remaining = getCooldownRemaining(message.author.id);

    if (remaining > 0) {
      return sendPlain(
        message.channel,
        `Slow down a little. Try again in ${Math.ceil(remaining / 1000)}s.`
      );
    }

    if (hasMassPing(prompt)) {
      return sendPlain(
        message.channel,
        'I won’t process prompts that try to ping users, roles, @here, or @everyone.'
      );
    }

    if (hasSpamPattern(prompt)) {
      return sendPlain(
        message.channel,
        `That prompt looks too spammy or too long. Keep it under ${MAX_PROMPT_LENGTH} characters and try again.`
      );
    }

    if (isRepeatedPrompt(message.author.id, prompt)) {
      return sendPlain(
        message.channel,
        'You already asked that. Change the question a little before trying again.'
      );
    }

    if (isLowEffortTroll(prompt)) {
      return sendPlain(
        message.channel,
        'I can help with real questions, explanations, writing, coding, and ideas. Try asking it another way.'
      );
    }

    await message.channel.sendTyping().catch(() => null);

    try {
      const answer = await askGemini(prompt);
      const chunks = splitMessage(answer?.text || '');

      for (const chunk of chunks) {
        await sendPlain(message.channel, chunk);
      }
    } catch (error) {
      console.error('[ask command]', error);

      return sendPlain(
        message.channel,
        'I could not reach the AI service right now.'
      );
    }
  }
};