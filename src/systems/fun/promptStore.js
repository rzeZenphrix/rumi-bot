const db = require('../../services/database');
const store = require('../../utils/simpleStore');

const CACHE_TTL_MS = Math.max(15000, Number(process.env.FUN_PROMPT_CACHE_TTL_MS || 120000));
const promptCache = new Map();

const FALLBACK_PROMPTS = Object.freeze({
  compliment: [
    { prompt_text: '{target} has elite energy.', weight: 3 },
    { prompt_text: '{target} somehow makes confidence look easy.', weight: 2 },
    { prompt_text: '{target} has the kind of presence people remember.', weight: 2 },
    { prompt_text: '{target} makes this place feel lighter.', weight: 1 }
  ],
  dare: [
    { prompt_text: 'Send a real compliment to someone in chat.', weight: 2 },
    { prompt_text: 'Reply using only emojis for your next message.', weight: 2 },
    { prompt_text: 'Drop a harmless hot take and defend it.', weight: 1 },
    { prompt_text: 'Type your next message with zero backspaces.', weight: 1 }
  ],
  fact: [
    { prompt_text: 'Discord launched in 2015.', weight: 1 },
    { prompt_text: 'A Discord snowflake contains timestamp information.', weight: 1 },
    { prompt_text: 'Webhooks let bots send cleaner branded messages.', weight: 1 },
    { prompt_text: 'Most animated server stickers use the Lottie format.', weight: 1 }
  ],
  fasttype: [
    { prompt_text: 'silver shadows move softly', weight: 2 },
    { prompt_text: 'quiet signals shape sharp instincts', weight: 2 },
    { prompt_text: 'clean code calms busy nights', weight: 1 },
    { prompt_text: 'every small fix builds momentum', weight: 1 }
  ],
  fortune: [
    { prompt_text: 'The stars are finally done testing your patience.', weight: 2 },
    { prompt_text: 'A quiet win is still a win.', weight: 2 },
    { prompt_text: 'Something stubborn is about to start moving.', weight: 1 },
    { prompt_text: 'Your next good idea will show up while you are busy doing something ordinary.', weight: 1 }
  ],
  joke: [
    { prompt_text: 'Why did the bot join the server? Because somebody had permission issues.', weight: 2 },
    { prompt_text: 'I told my code a joke. It threw an exception.', weight: 2 },
    { prompt_text: 'Why do developers hate nature? Too many bugs.', weight: 1 },
    { prompt_text: 'My deploy said it would only take a minute. That was character development.', weight: 1 }
  ],
  mock: [
    { prompt_text: 'you really thought that was a good idea', weight: 2 },
    { prompt_text: 'this is absolutely going to end well', weight: 1 },
    { prompt_text: 'i am being very normal about this', weight: 1 }
  ],
  randomname: [
    { prompt_text: 'Nyx Hollow', weight: 2 },
    { prompt_text: 'Sable Rowan', weight: 2 },
    { prompt_text: 'Mira Vale', weight: 1 },
    { prompt_text: 'Aster Quinn', weight: 1 }
  ],
  roast: [
    { prompt_text: '{target} has the confidence of a typo in production.', weight: 2 },
    { prompt_text: '{target} moves like their thoughts are buffering.', weight: 2 },
    { prompt_text: '{target} has side-quest energy in a main-story argument.', weight: 1 },
    { prompt_text: '{target} types like every sentence needs dramatic buildup.', weight: 1 }
  ],
  truth: [
    { prompt_text: 'What is a goal you are secretly proud of?', weight: 2 },
    { prompt_text: 'What is one habit you want to improve?', weight: 2 },
    { prompt_text: 'What is the funniest mistake you made recently?', weight: 1 },
    { prompt_text: 'What is something small that instantly makes your day better?', weight: 1 }
  ],
  truthdeep: [
    { prompt_text: 'What is one thing you wish people understood about you?', weight: 2, nsfw: true },
    { prompt_text: 'What part of yourself are you still learning to accept?', weight: 2, nsfw: true },
    { prompt_text: 'When do you feel the most lonely, even around other people?', weight: 1, nsfw: true },
    { prompt_text: 'What are you still carrying that you never really got to talk about?', weight: 1, nsfw: true }
  ],
  wyr: [
    { prompt_text: 'Would you rather have perfect timing or perfect memory?', weight: 2 },
    { prompt_text: 'Would you rather always know what to say or always know what people mean?', weight: 2 },
    { prompt_text: 'Would you rather lose sleep for success or comfort for freedom?', weight: 1 },
    { prompt_text: 'Would you rather be impossible to embarrass or impossible to ignore?', weight: 1 }
  ]
});

function cacheKey(type, safety) {
  return `${String(type || '').toLowerCase()}:${safety}`;
}

function getCached(key) {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    promptCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  promptCache.set(key, {
    value,
    at: Date.now()
  });
  return value;
}

function normalizeEntries(entries = []) {
  return entries
    .map((entry) => ({
      prompt_text: String(entry.prompt_text || entry.promptText || '').trim(),
      weight: Math.max(1, Number(entry.weight || 1)),
      nsfw: Boolean(entry.nsfw)
    }))
    .filter((entry) => entry.prompt_text);
}

function getFallbackEntries(type, safety = 'safe') {
  const entries = normalizeEntries(FALLBACK_PROMPTS[String(type || '').toLowerCase()] || []);
  if (safety === 'nsfw') return entries.filter((entry) => entry.nsfw);
  if (safety === 'safe') return entries.filter((entry) => !entry.nsfw);
  return entries;
}

async function isGuildNsfwEnabled(guildId) {
  if (!guildId) return false;
  return Boolean(await store.getGuild(guildId, 'settings', 'nsfwEnabled', false));
}

async function loadPromptEntries(type, safety = 'safe') {
  const key = cacheKey(type, safety);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    const rows = await db.listFunPromptEntries(type, {
      nsfwOnly: safety === 'nsfw',
      includeNsfw: safety === 'any'
    });

    const normalized = normalizeEntries(rows);
    if (normalized.length) {
      return setCached(key, normalized);
    }
  } catch (_error) {
    // Database failures already get throttled in the database layer.
  }

  return setCached(key, getFallbackEntries(type, safety));
}

function pickWeighted(entries = []) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight || 1)), 0);
  let roll = Math.random() * total;

  for (const entry of entries) {
    roll -= Math.max(1, Number(entry.weight || 1));
    if (roll <= 0) return entry;
  }

  return entries[entries.length - 1];
}

function renderPrompt(text, context = {}) {
  return String(text || '')
    .replace(/\{([a-z0-9_]+)\}/gi, (_match, token) => {
      const value = context[token];
      return value == null ? '' : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function getPrompt(type, options = {}) {
  const safety = options.safety || 'safe';
  const guildId = options.guildId || null;

  if (safety === 'nsfw') {
    const enabled = await isGuildNsfwEnabled(guildId);
    if (!enabled) {
      return {
        ok: false,
        reason: 'nsfw_disabled',
        text: null
      };
    }
  }

  const entries = await loadPromptEntries(type, safety);
  const chosen = pickWeighted(entries);
  if (!chosen) {
    return {
      ok: false,
      reason: 'missing_prompt',
      text: null
    };
  }

  return {
    ok: true,
    reason: null,
    text: renderPrompt(chosen.prompt_text, options.context || {}),
    prompt: chosen
  };
}

module.exports = {
  isGuildNsfwEnabled,
  getPrompt,
  renderPrompt
};
