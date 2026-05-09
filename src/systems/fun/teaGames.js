const activeGames = new Map();

const FRAGMENTS = [
  'ab', 'ac', 'ad', 'ag', 'al', 'am', 'an', 'ar', 'as', 'at', 'ba', 'be', 'bi', 'bo', 'br', 'ca', 'ce', 'ch', 'cl', 'co', 'cr',
  'de', 'di', 'do', 'dr', 'ea', 'ec', 'ed', 'el', 'em', 'en', 'er', 'es', 'ex', 'fa', 'fe', 'fi', 'fl', 'fo', 'fr', 'ga',
  'ge', 'gi', 'gl', 'go', 'gr', 'ha', 'he', 'hi', 'ho', 'ic', 'id', 'ig', 'il', 'im', 'in', 'ir', 'is', 'it', 'jo', 'ju',
  'ka', 'ke', 'la', 'le', 'li', 'lo', 'ma', 'me', 'mi', 'mo', 'na', 'ne', 'ni', 'no', 'oc', 'od', 'ol', 'om', 'on', 'op',
  'or', 'os', 'pa', 'pe', 'ph', 'pi', 'pl', 'po', 'pr', 'qu', 'ra', 're', 'ri', 'ro', 'sa', 'sc', 'se', 'sh', 'si', 'sk',
  'sl', 'so', 'sp', 'st', 'su', 'ta', 'te', 'th', 'ti', 'to', 'tr', 'ul', 'um', 'un', 'ur', 'va', 've', 'vi', 'wa', 'we',
  'ack', 'age', 'air', 'ake', 'all', 'and', 'ant', 'ard', 'are', 'art', 'ate', 'ble', 'cal', 'can', 'car', 'cat', 'cha', 'con',
  'der', 'dis', 'ent', 'est', 'ful', 'gen', 'ght', 'ing', 'ion', 'ist', 'ive', 'lar', 'let', 'man', 'ment', 'nes', 'ous', 'per',
  'pre', 'pro', 'res', 'sta', 'str', 'ter', 'tic', 'tion', 'tra', 'ver'
];

const UNSCRAMBLE_WORDS = [
  'discord', 'server', 'member', 'channel', 'message', 'reaction', 'premium', 'moderation', 'economy', 'music', 'playlist', 'volume',
  'dragon', 'castle', 'shadow', 'rabbit', 'winter', 'silver', 'planet', 'galaxy', 'crystal', 'forest', 'ocean', 'flower', 'button',
  'keyboard', 'monitor', 'energy', 'future', 'wonder', 'dream', 'lunar', 'spirit', 'anime', 'memory', 'signal', 'cosmic', 'nebula'
];

const FORBIDDEN_WORDS = [
  'rumi', 'bot', 'tea', 'music', 'game', 'server', 'chat', 'hello', 'yes', 'no', 'what', 'why', 'when', 'where', 'okay', 'wait',
  'lol', 'love', 'bruh', 'help', 'join', 'win', 'lose', 'nice', 'cool', 'stop', 'go', 'run', 'blue', 'white', 'black', 'green', 'red'
];

function gameKey(message) {
  return `${message.guild.id}:${message.channel.id}`;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffleWord(word) {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const out = letters.join('');
  return out === word ? shuffleWord(word) : out;
}

function cleanWord(input) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function hasWord(content, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(String(content || ''));
}

function heartBar(lives) {
  return '♥'.repeat(Math.max(0, lives)) || '0';
}

function nameOf(player) {
  return player.member?.displayName || player.user?.username || 'Unknown';
}

function alive(players) {
  return [...players.values()].filter((p) => p.lives > 0 && !p.out);
}

function scoreboard(players, mode = 'score') {
  const rows = [...players.values()].sort((a, b) => {
    if (mode === 'lives') return b.lives - a.lives || b.score - a.score;
    return b.score - a.score || b.lives - a.lives;
  });

  return rows.map((p, i) => {
    const value = mode === 'lives' ? `${heartBar(p.lives)} lives` : `${p.score} pts`;
    return `${i + 1}. ${nameOf(p)} — ${value}`;
  }).join('\n');
}

async function say(channel, content, users = []) {
  return channel.send({
    content: String(content).slice(0, 2000),
    allowedMentions: { users }
  });
}

function validContainsWord(content, fragment, usedWords, requireContains = true) {
  const word = cleanWord(content);
  if (word.length < 3) return { ok: false, reason: 'word must be at least 3 letters.' };
  if (word.length > 24) return { ok: false, reason: 'word is too long.' };
  if (usedWords.has(word)) return { ok: false, reason: `\`${word}\` was already used.` };
  if (requireContains && !word.includes(fragment)) return { ok: false, reason: `word must contain \`${fragment}\`.` };
  if (!requireContains && word.includes(fragment)) return { ok: false, reason: `word cannot contain \`${fragment}\`.` };
  return { ok: true, word };
}

function validStartsWithWord(content, letter, usedWords) {
  const word = cleanWord(content);
  if (word.length < 3) return { ok: false, reason: 'word must be at least 3 letters.' };
  if (usedWords.has(word)) return { ok: false, reason: `\`${word}\` was already used.` };
  if (!word.startsWith(letter)) return { ok: false, reason: `word must start with \`${letter}\`.` };
  return { ok: true, word };
}

function waitForOne(channel, playerId, seconds, validator) {
  return new Promise((resolve) => {
    let done = false;
    const collector = channel.createMessageCollector({
      time: seconds * 1000,
      filter: (m) => !m.author.bot && m.author.id === playerId
    });

    collector.on('collect', async (m) => {
      const result = validator(m.content);
      if (!result.ok) {
        await say(channel, `${m.author}, ${result.reason}`, [m.author.id]).catch(() => null);
        return;
      }

      done = true;
      collector.stop('valid');
      resolve({ ok: true, word: result.word, message: m, at: Date.now() });
    });

    collector.on('end', () => {
      if (!done) resolve({ ok: false });
    });
  });
}

function waitForFirst(channel, playerIds, seconds, validator) {
  const allowed = new Set(playerIds);

  return new Promise((resolve) => {
    let done = false;
    const collector = channel.createMessageCollector({
      time: seconds * 1000,
      filter: (m) => !m.author.bot && allowed.has(m.author.id)
    });

    collector.on('collect', (m) => {
      const result = validator(m.content);
      if (!result.ok) return;

      done = true;
      collector.stop('valid');
      resolve({ ok: true, word: result.word, message: m, at: Date.now() });
    });

    collector.on('end', () => {
      if (!done) resolve({ ok: false });
    });
  });
}

function waitForAllOrTimeout(channel, playerIds, seconds, validator) {
  const waiting = new Set(playerIds);
  const answers = new Map();

  return new Promise((resolve) => {
    const collector = channel.createMessageCollector({
      time: seconds * 1000,
      filter: (m) => !m.author.bot && waiting.has(m.author.id)
    });

    collector.on('collect', (m) => {
      const result = validator(m.content);
      if (!result.ok) return;

      waiting.delete(m.author.id);
      answers.set(m.author.id, {
        word: result.word,
        message: m,
        at: Date.now()
      });

      if (!waiting.size) collector.stop('all_answered');
    });

    collector.on('end', () => {
      resolve({
        answers,
        missed: [...waiting]
      });
    });
  });
}

async function joinPhase(message, gameName, seconds = 20) {
  const players = new Map();

  players.set(message.author.id, {
    id: message.author.id,
    user: message.author,
    member: message.member,
    score: 0,
    lives: 0,
    out: false
  });

  await say(
    message.channel,
    `${gameName} is starting. Type \`join\` in ${seconds}s to play.\nHost joined: <@${message.author.id}>`,
    [message.author.id]
  );

  return new Promise((resolve) => {
    const collector = message.channel.createMessageCollector({
      time: seconds * 1000,
      filter: (m) => !m.author.bot && m.guild?.id === message.guild.id && m.content.trim().toLowerCase() === 'join'
    });

    collector.on('collect', async (m) => {
      if (players.has(m.author.id)) return;

      players.set(m.author.id, {
        id: m.author.id,
        user: m.author,
        member: m.member,
        score: 0,
        lives: 0,
        out: false
      });

      await say(message.channel, `${m.author} joined. Players: ${players.size}`, [m.author.id]).catch(() => null);
    });

    collector.on('end', () => resolve(players));
  });
}

async function withGameLock(message, runner) {
  const key = gameKey(message);

  if (activeGames.has(key)) {
    await say(message.channel, 'A game is already running in this channel.');
    return;
  }

  activeGames.set(key, true);

  try {
    await runner();
  } finally {
    activeGames.delete(key);
  }
}

async function runBlackTea(message, args = []) {
  return withGameLock(message, async () => {
    const lives = clamp(args[0], 1, 5, 2);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Blacktea', 20);

    if (players.size < 2) return say(message.channel, 'Blacktea cancelled. At least 2 players are needed.');

    for (const p of players.values()) p.lives = lives;

    const used = new Set();
    const order = [...players.values()];
    let turn = 0;
    let round = 1;

    await say(message.channel, `Blacktea started. Type words containing the fragment. Lives: ${lives}.`);

    while (alive(players).length > 1 && round <= 100) {
      const p = order[turn % order.length];
      turn += 1;
      if (p.lives <= 0) continue;

      const fragment = pick(FRAGMENTS);

      await say(
        message.channel,
        `Round ${round}. <@${p.id}>, type a word containing \`${fragment}\` in ${seconds}s. ${heartBar(p.lives)}`,
        [p.id]
      );

      const result = await waitForOne(message.channel, p.id, seconds, (text) => validContainsWord(text, fragment, used, true));

      if (result.ok) {
        used.add(result.word);
        await say(message.channel, `Good. ${nameOf(p)} used \`${result.word}\`.`);
      } else {
        p.lives -= 1;
        await say(message.channel, `${nameOf(p)} lost a life. ${heartBar(p.lives)}`);
      }

      round += 1;
    }

    const winner = alive(players)[0];

    return say(
      message.channel,
      winner ? `Blacktea winner: <@${winner.id}>\n${scoreboard(players, 'lives')}` : `Blacktea ended.\n${scoreboard(players, 'lives')}`,
      winner ? [winner.id] : []
    );
  });
}

async function runWhiteTea(message, args = []) {
  return withGameLock(message, async () => {
    const lives = clamp(args[0], 1, 5, 2);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Whitetea', 20);

    if (players.size < 2) return say(message.channel, 'Whitetea cancelled. At least 2 players are needed.');

    for (const p of players.values()) p.lives = lives;

    const used = new Set();
    const order = [...players.values()];
    let turn = 0;
    let round = 1;

    await say(message.channel, `Whitetea started. Avoid the forbidden fragment. Lives: ${lives}.`);

    while (alive(players).length > 1 && round <= 100) {
      const p = order[turn % order.length];
      turn += 1;
      if (p.lives <= 0) continue;

      const fragment = pick(FRAGMENTS);

      await say(
        message.channel,
        `Round ${round}. <@${p.id}>, type a word that does **not** contain \`${fragment}\` in ${seconds}s.`,
        [p.id]
      );

      const result = await waitForOne(message.channel, p.id, seconds, (text) => validContainsWord(text, fragment, used, false));

      if (result.ok) {
        used.add(result.word);
        await say(message.channel, `Safe. ${nameOf(p)} used \`${result.word}\`.`);
      } else {
        p.lives -= 1;
        await say(message.channel, `${nameOf(p)} failed the white tea rule. ${heartBar(p.lives)}`);
      }

      round += 1;
    }

    const winner = alive(players)[0];

    return say(
      message.channel,
      winner ? `Whitetea winner: <@${winner.id}>\n${scoreboard(players, 'lives')}` : `Whitetea ended.\n${scoreboard(players, 'lives')}`,
      winner ? [winner.id] : []
    );
  });
}

async function runGreenTea(message, args = []) {
  return withGameLock(message, async () => {
    const target = clamp(args[0], 2, 15, 5);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Greentea', 20);

    if (players.size < 2) return say(message.channel, 'Greentea cancelled. At least 2 players are needed.');

    const used = new Set();
    let round = 1;
    let winner = null;

    await say(message.channel, `Greentea started. First to ${target} points wins.`);

    while (!winner && round <= 60) {
      const fragment = pick(FRAGMENTS);

      await say(message.channel, `Round ${round}. First valid word containing \`${fragment}\` gets 1 point. ${seconds}s.`);

      const result = await waitForFirst(message.channel, [...players.keys()], seconds, (text) => validContainsWord(text, fragment, used, true));

      if (!result.ok) {
        await say(message.channel, 'No one scored.');
        round += 1;
        continue;
      }

      used.add(result.word);

      const p = players.get(result.message.author.id);
      p.score += 1;

      await say(message.channel, `${nameOf(p)} scored with \`${result.word}\`. ${p.score}/${target}`);

      if (p.score >= target) winner = p;
      round += 1;
    }

    return say(
      message.channel,
      winner ? `Greentea winner: <@${winner.id}>\n${scoreboard(players)}` : `Greentea ended.\n${scoreboard(players)}`,
      winner ? [winner.id] : []
    );
  });
}

async function runRedTea(message, args = []) {
  return withGameLock(message, async () => {
    const lives = clamp(args[0], 1, 4, 1);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Redtea', 20);

    if (players.size < 2) return say(message.channel, 'Redtea cancelled. At least 2 players are needed.');

    for (const p of players.values()) p.lives = lives;

    const used = new Set();
    let round = 1;

    await say(message.channel, 'Redtea started. Everyone answers. Missers lose life; if everyone answers, the slowest loses life.');

    while (alive(players).length > 1 && round <= 80) {
      const current = alive(players);
      const fragment = pick(FRAGMENTS);

      await say(
        message.channel,
        `Round ${round}. Everyone type a word containing \`${fragment}\` in ${seconds}s.`,
        current.map((p) => p.id)
      );

      const { answers, missed } = await waitForAllOrTimeout(
        message.channel,
        current.map((p) => p.id),
        seconds,
        (text) => validContainsWord(text, fragment, used, true)
      );

      for (const answer of answers.values()) used.add(answer.word);

      const losers = missed.length
        ? missed.map((pid) => players.get(pid)).filter(Boolean)
        : [[...answers.entries()].sort((a, b) => b[1].at - a[1].at)[0]].map(([pid]) => players.get(pid)).filter(Boolean);

      for (const loser of losers) loser.lives -= 1;

      await say(message.channel, `${losers.map(nameOf).join(', ')} lost a life.\n${scoreboard(players, 'lives')}`);

      round += 1;
    }

    const winner = alive(players)[0];

    return say(
      message.channel,
      winner ? `Redtea winner: <@${winner.id}>\n${scoreboard(players, 'lives')}` : `Redtea ended.\n${scoreboard(players, 'lives')}`,
      winner ? [winner.id] : []
    );
  });
}

async function runWordChain(message, args = []) {
  return withGameLock(message, async () => {
    const lives = clamp(args[0], 1, 5, 2);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Wordchain', 20);

    if (players.size < 2) return say(message.channel, 'Wordchain cancelled. At least 2 players are needed.');

    for (const p of players.values()) p.lives = lives;

    const used = new Set();
    const order = [...players.values()];
    let required = pick('abcdefghijklmnopqrstuvwxyz'.split(''));
    let turn = 0;
    let round = 1;

    await say(message.channel, `Wordchain started. Use a word starting with the required letter. Lives: ${lives}.`);

    while (alive(players).length > 1 && round <= 120) {
      const p = order[turn % order.length];
      turn += 1;
      if (p.lives <= 0) continue;

      await say(message.channel, `Round ${round}. <@${p.id}>, word starts with \`${required}\`. ${seconds}s.`, [p.id]);

      const result = await waitForOne(message.channel, p.id, seconds, (text) => validStartsWithWord(text, required, used));

      if (result.ok) {
        used.add(result.word);
        required = result.word.at(-1);
        await say(message.channel, `${nameOf(p)} used \`${result.word}\`. Next letter: \`${required}\`.`);
      } else {
        p.lives -= 1;
        await say(message.channel, `${nameOf(p)} lost a life. ${heartBar(p.lives)}`);
      }

      round += 1;
    }

    const winner = alive(players)[0];

    return say(
      message.channel,
      winner ? `Wordchain winner: <@${winner.id}>\n${scoreboard(players, 'lives')}` : `Wordchain ended.\n${scoreboard(players, 'lives')}`,
      winner ? [winner.id] : []
    );
  });
}

async function runUnscramble(message, args = []) {
  return withGameLock(message, async () => {
    const target = clamp(args[0], 2, 15, 5);
    const seconds = clamp(args[1], 8, 30, 15);
    const players = await joinPhase(message, 'Unscramble', 15);

    if (players.size < 1) return say(message.channel, 'Unscramble cancelled.');

    let round = 1;
    let winner = null;
    const used = new Set();

    await say(message.channel, `Unscramble started. First to ${target} points wins.`);

    while (!winner && round <= 60) {
      let word = pick(UNSCRAMBLE_WORDS);
      while (used.has(word)) word = pick(UNSCRAMBLE_WORDS);
      used.add(word);

      const scrambled = shuffleWord(word);

      await say(message.channel, `Round ${round}. Unscramble: \`${scrambled}\`. ${seconds}s.`);

      const result = await waitForFirst(message.channel, [...players.keys()], seconds, (content) => {
        const guess = cleanWord(content);
        return guess === word ? { ok: true, word: guess } : { ok: false };
      });

      if (!result.ok) {
        await say(message.channel, `No one got it. Answer: \`${word}\`.`);
        round += 1;
        continue;
      }

      const p = players.get(result.message.author.id);
      p.score += 1;

      await say(message.channel, `${nameOf(p)} solved \`${word}\`. ${p.score}/${target}`);

      if (p.score >= target) winner = p;
      round += 1;
    }

    return say(
      message.channel,
      winner ? `Unscramble winner: <@${winner.id}>\n${scoreboard(players)}` : `Unscramble ended.\n${scoreboard(players)}`,
      winner ? [winner.id] : []
    );
  });
}

async function runForbiddenWord(message, args = []) {
  return withGameLock(message, async () => {
    const seconds = clamp(args[0], 15, 60, 30);
    const players = await joinPhase(message, 'Forbiddenword', 20);

    if (players.size < 2) return say(message.channel, 'Forbiddenword cancelled. At least 2 players are needed.');

    for (const p of players.values()) p.lives = 1;

    let round = 1;

    await say(message.channel, 'Forbiddenword started. Chat normally. Do not say the forbidden word.');

    while (alive(players).length > 1 && round <= 40) {
      const word = pick(FORBIDDEN_WORDS);
      const current = alive(players);

      await say(
        message.channel,
        `Round ${round}. Forbidden word: ||${word}||. Survive for ${seconds}s.`,
        current.map((p) => p.id)
      );

      const loser = await new Promise((resolve) => {
        let found = null;
        const aliveIds = new Set(current.map((p) => p.id));

        const collector = message.channel.createMessageCollector({
          time: seconds * 1000,
          filter: (m) => !m.author.bot && aliveIds.has(m.author.id)
        });

        collector.on('collect', (m) => {
          if (!hasWord(m.content, word)) return;
          found = players.get(m.author.id);
          collector.stop('forbidden');
        });

        collector.on('end', () => resolve(found));
      });

      if (loser) {
        loser.lives = 0;
        loser.out = true;
        await say(message.channel, `${nameOf(loser)} said the forbidden word and is out.`);
      } else {
        await say(message.channel, `Safe round. Nobody said \`${word}\`.`);
      }

      round += 1;
    }

    const winner = alive(players)[0];

    return say(
      message.channel,
      winner ? `Forbiddenword winner: <@${winner.id}>.` : 'Forbiddenword ended with no winner.',
      winner ? [winner.id] : []
    );
  });
}

module.exports = {
  runBlackTea,
  runWhiteTea,
  runGreenTea,
  runRedTea,
  runWordChain,
  runUnscramble,
  runForbiddenWord
};