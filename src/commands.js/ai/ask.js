const { askGemini } = require('../../services/google/gemini');
const { buildRagPrompt } = require('../../systems/ai/rag');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const { consumeDailyUsage } = require('../../systems/monetization/usage');

const userCooldowns = new Map();
const lastPrompts = new Map();

const COOLDOWN_MS = Number(process.env.ASK_COOLDOWN_MS || 8000);
const MAX_PROMPT_LENGTH = Number(process.env.ASK_MAX_PROMPT_LENGTH || 1800);
const MAX_OUTPUT_CHARS = 1000;

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
  return Boolean(links && links.length >= 4);
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

function isTaskRequest(text) {
  const clean = String(text || '').toLowerCase();
  const patterns = [
    /\b(write|generate|make|build|fix|debug|implement|refactor|optimize|create)\b.{0,24}\b(code|script|bot|website|app|program|regex)\b/,
    /\bsolve\b.{0,18}\bfor me\b/,
    /\bdo (my|this) (homework|assignment|project)\b/,
    /\bwrite me\b.{0,20}\bfunction\b/,
    /\bcomplete\b.{0,20}\bproject\b/,
    /\bgive me\b.{0,20}\bfull code\b/
  ];

  return patterns.some((pattern) => pattern.test(clean));
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

function squeezeResponse(text, max = MAX_OUTPUT_CHARS) {
  const safe = neutralizeMentions(text || '').trim();

  if (!safe) return 'I could not generate a useful response for that.';
  if (safe.length <= max) return safe;

  let cut = safe.lastIndexOf('\n', max);
  if (cut < 700) cut = safe.lastIndexOf('. ', max);
  if (cut < 700) cut = safe.lastIndexOf(' ', max);
  if (cut < 700) cut = max - 1;

  return `${safe.slice(0, cut).trim()}…`;
}

async function sendPlain(channel, text) {
  return channel.send({
    content: neutralizeMentions(String(text || '').slice(0, MAX_OUTPUT_CHARS)),
    allowedMentions: { parse: [] }
  });
}

function usageScopeKey(message, access) {
  if (message.guild && access?.hasServerPremiumBase) {
    return `guild:${message.guild.id}:${message.author.id}`;
  }

  return `user:${message.author.id}`;
}

module.exports = {
  name: 'ask',
  aliases: ['ai', 'rumi'],
  category: 'ai',
  description: 'Ask Rumi a conversational question.',
  usage: '<question>',
  examples: [
    'rumi meow for me',
    'ai what is a cat?'
  ],

  async execute({ client, message, args }) {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      return sendPlain(message.channel, 'Ask me a question and I will try to help.');
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
        'I will not process prompts that try to ping users, roles, @here, or @everyone.'
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
        'I am here for real conversation, calm questions, and playful chat. Try asking in a normal way.'
      );
    }

    if (isTaskRequest(prompt)) {
      return sendPlain(
        message.channel,
        'I am here to chat, explain things, and talk through ideas, but I am not taking on coding or task-work requests.'
      );
    }

    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const limit = access?.limits?.aiQueriesPerDay || 5;
    const usage = await consumeDailyUsage('ask', usageScopeKey(message, access), limit).catch(() => null);
    if (usage && !usage.ok) {
      return sendPlain(
        message.channel,
        `You have used all ${limit} AI quer${limit === 1 ? 'y' : 'ies'} for today. That resets at 00:00 UTC. Upgrade to [premium](https://rumi.rocks/plans) for a higher quota and dedicated service!`
      );
    }

    await message.channel.sendTyping().catch(() => null);

    try {
      const rag = await buildRagPrompt(client, prompt);
      const answer = await askGemini(rag.prompt, {
        maxOutputTokens: Number(process.env.ASK_MAX_OUTPUT_TOKENS || 280),
        temperature: 0.65
      });

      await sendPlain(message.channel, squeezeResponse(answer?.text || ''));
    } catch (error) {
      console.error('[ask command]', error);

      return sendPlain(
        message.channel,
        'I could not reach my service due to high demand, please try again later or upgrade to [premium](https://rumi.rocks/plans) for dedicated service!'
      );
    }
  }
};
