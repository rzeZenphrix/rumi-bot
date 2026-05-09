const { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
 } = require('discord.js');
const respond = require('../../utils/respond');
const {
  createSession,
  getSession,
  updateSession,
  deleteSession
} = require('../../utils/interactionSessions');
const db = require('../../services/database');
const { resolveUser } = require('../../utils/resolveUser');

const SESSION_PREFIX = 'rps';
const CHOICE_NAMES = ['rock', 'paper', 'scissors'];
const CHOICES = {
  rock: {
    emoji: '🪨',
    label: 'Rock',
    beats: 'scissors',
    verb: 'crushes'
  },
  paper: {
    emoji: '📄',
    label: 'Paper',
    beats: 'rock',
    verb: 'covers'
  },
  scissors: {
    emoji: '✂️',
    label: 'Scissors',
    beats: 'paper',
    verb: 'cuts'
  }
};

function statsNamespace(guildId) {
  return `fun:rps:stats:${guildId}`;
}

function defaultStats() {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPlayedAt: null
  };
}

function normalizeChoice(input) {
  const value = String(input || '').trim().toLowerCase();
  if (['r', 'rock', 'stone', '🪨', '✊'].includes(value)) return 'rock';
  if (['p', 'paper', 'page', '📄', '✋'].includes(value)) return 'paper';
  if (['s', 'scissor', 'scissors', 'shears', '✂', '✂️', '✌'].includes(value)) return 'scissors';
  if (['random', 'rand', 'shuffle', '?'].includes(value)) return randomChoice();
  return null;
}

function randomChoice() {
  return CHOICE_NAMES[Math.floor(Math.random() * CHOICE_NAMES.length)];
}

function resultFor(left, right) {
  if (left === right) return 'tie';
  return CHOICES[left].beats === right ? 'win' : 'loss';
}

function opposite(result) {
  if (result === 'win') return 'loss';
  if (result === 'loss') return 'win';
  return 'tie';
}

function resultWord(result) {
  if (result === 'win') return 'Win';
  if (result === 'loss') return 'Loss';
  return 'Tie';
}

function parseBestOf(tokens = [], fallback = 3) {
  const joined = tokens.join(' ').toLowerCase();
  const match = joined.match(/(?:bo|best\s*of\s*)?(1|3|5|7|9)\b/);
  const value = match ? Number(match[1]) : Number(fallback);
  return [1, 3, 5, 7, 9].includes(value) ? value : 3;
}

function neededWins(bestOf) {
  return Math.floor(Number(bestOf || 3) / 2) + 1;
}

function choiceText(choice) {
  const item = CHOICES[choice];
  return item ? `${item.emoji} **${item.label}**` : '`none`';
}

function explainRound(leftChoice, rightChoice, leftName = 'Player 1', rightName = 'Player 2') {
  const result = resultFor(leftChoice, rightChoice);

  if (result === 'tie') {
    return `${choiceText(leftChoice)} meets ${choiceText(rightChoice)} — the round is a **tie**.`;
  }

  const winnerChoice = result === 'win' ? leftChoice : rightChoice;
  const loserChoice = result === 'win' ? rightChoice : leftChoice;
  const winnerName = result === 'win' ? leftName : rightName;
  const loserName = result === 'win' ? rightName : leftName;

  return `${CHOICES[winnerChoice].emoji} **${CHOICES[winnerChoice].label}** ${CHOICES[winnerChoice].verb} ${CHOICES[loserChoice].emoji} **${CHOICES[loserChoice].label}** — **${winnerName}** beats **${loserName}**.`;
}

function bar(current, total) {
  const filled = Math.min(total, Math.max(0, Number(current || 0)));
  return '●'.repeat(filled) + '○'.repeat(Math.max(0, total - filled));
}

async function getStats(guildId, userId) {
  const stored = await db.getKv(statsNamespace(guildId), userId, defaultStats());
  return { ...defaultStats(), ...(stored || {}) };
}

async function saveStats(guildId, userId, stats) {
  return db.setKv(statsNamespace(guildId), userId, {
    ...defaultStats(),
    ...(stats || {}),
    lastPlayedAt: new Date().toISOString()
  }).catch(() => null);
}

async function recordStats(guildId, userId, result) {
  if (!guildId || !userId) return null;
  const stats = await getStats(guildId, userId);

  stats.played += 1;

  if (result === 'win') {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else if (result === 'loss') {
    stats.losses += 1;
    stats.currentStreak = 0;
  } else {
    stats.ties += 1;
  }

  await saveStats(guildId, userId, stats);
  return stats;
}

async function recordSoloRound(guildId, userId, result) {
  return recordStats(guildId, userId, result);
}

async function recordDuelRound(guildId, ownerId, opponentId, ownerResult) {
  await recordStats(guildId, ownerId, ownerResult);
  await recordStats(guildId, opponentId, opposite(ownerResult));
}

function makeState({ ownerId, opponentId = null, bestOf = 3, mode = 'solo' }) {
  const sessionId = createSession(SESSION_PREFIX, {
    ownerId,
    opponentId,
    mode,
    bestOf,
    round: 1,
    scores: {
      owner: 0,
      opponent: 0,
      bot: 0
    },
    choices: {},
    status: 'active',
    lastRound: null,
    winnerId: null,
    createdAt: Date.now()
  }, 30 * 60 * 1000);

  return getSession(SESSION_PREFIX, sessionId);
}

function participantName(state, side) {
  if (side === 'owner') return `<@${state.ownerId}>`;
  if (state.mode === 'duel') return `<@${state.opponentId}>`;
  return 'Rumi';
}

function scoreLine(state) {
  const target = neededWins(state.bestOf);
  const left = state.scores.owner || 0;
  const right = state.mode === 'duel' ? (state.scores.opponent || 0) : (state.scores.bot || 0);

  return [
    `${participantName(state, 'owner')}: **${left}** ${bar(left, target)}`,
    `${participantName(state, 'opponent')}: **${right}** ${bar(right, target)}`
  ].join('\n');
}

function statusText(state) {
  if (state.status === 'finished') {
    if (state.winnerId === 'bot') return 'Match over — **Rumi wins**. Hit rematch to run it back.';
    if (state.winnerId) return `Match over — <@${state.winnerId}> wins. Hit rematch to run it back.`;
    return 'Match over. Hit rematch to run it back.';
  }

  if (state.mode === 'duel') {
    const ownerLocked = state.choices[state.ownerId] ? '✅ locked' : 'waiting';
    const opponentLocked = state.choices[state.opponentId] ? '✅ locked' : 'waiting';
    return [
      `Round **${state.round}** — choose secretly using the buttons below.`,
      `<@${state.ownerId}>: ${ownerLocked}`,
      `<@${state.opponentId}>: ${opponentLocked}`
    ].join('\n');
  }

  return `Round **${state.round}** — pick your move. First to **${neededWins(state.bestOf)}** wins.`;
}

function buildEmbed(state) {
  const embed = new EmbedBuilder()
    .setColor(respond.DEFAULT_EMBED_COLOR)
    .setTitle(state.mode === 'duel' ? 'Rock Paper Scissors Duel' : 'Rock Paper Scissors Arena')
    .setDescription(statusText(state))
    .addFields(
      {
        name: `Score · Best of ${state.bestOf}`,
        value: scoreLine(state),
        inline: false
      }
    )
    .setFooter({ text: 'Rock beats scissors · Paper beats rock · Scissors beats paper' });

  if (state.lastRound) {
    embed.addFields({
      name: 'Last round',
      value: state.lastRound,
      inline: false
    });
  }

  return embed;
}

function choiceButton(sessionId, choice, disabled) {
  return new ButtonBuilder()
    .setCustomId(`${SESSION_PREFIX}:${sessionId}:choice:${choice}`)
    .setEmoji(CHOICES[choice].emoji)
    .setLabel(CHOICES[choice].label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(Boolean(disabled));
}

function buildRows(state) {
  const inactive = state.status !== 'active';

  return [
    new ActionRowBuilder().addComponents(
      choiceButton(state.id, 'rock', inactive),
      choiceButton(state.id, 'paper', inactive),
      choiceButton(state.id, 'scissors', inactive),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:choice:random`)
        .setEmoji('🎲')
        .setLabel('Random')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(inactive)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:control:rematch`)
        .setEmoji('🔁')
        .setLabel('Rematch')
        .setStyle(ButtonStyle.Success)
        .setDisabled(state.status !== 'finished'),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:control:forfeit`)
        .setEmoji('🏳️')
        .setLabel('Forfeit')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(state.status !== 'active'),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:control:close`)
        .setEmoji('✖️')
        .setLabel('Close')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function payloadFor(state, context = null) {
  const user = context?.author || context?.user || null;
  const message = context?.author
    ? context
    : { member: context?.member || null, guild: context?.guild || null };
  return respond.stylePayload(state.status === 'finished' ? 'good' : 'info', user, {
    embeds: [buildEmbed(state)],
    components: buildRows(state),
    allowedMentions: { users: [state.ownerId, state.opponentId].filter(Boolean), roles: [] }
  }, { message });
}

function finishIfNeeded(state) {
  const target = neededWins(state.bestOf);
  const ownerScore = state.scores.owner || 0;
  const rivalScore = state.mode === 'duel' ? (state.scores.opponent || 0) : (state.scores.bot || 0);

  if (ownerScore >= target) {
    state.status = 'finished';
    state.winnerId = state.ownerId;
  } else if (rivalScore >= target) {
    state.status = 'finished';
    state.winnerId = state.mode === 'duel' ? state.opponentId : 'bot';
  }

  return state;
}

async function applySoloChoice(state, userChoice, guildId) {
  const botChoice = randomChoice();
  const result = resultFor(userChoice, botChoice);

  if (result === 'win') state.scores.owner += 1;
  if (result === 'loss') state.scores.bot += 1;

  await recordSoloRound(guildId, state.ownerId, result).catch(() => null);

  state.lastRound = [
    `${choiceText(userChoice)} vs ${choiceText(botChoice)}`,
    explainRound(userChoice, botChoice, 'You', 'Rumi'),
    `Result: **${resultWord(result)}**`
  ].join('\n');

  finishIfNeeded(state);
  if (state.status === 'active') state.round += 1;

  return state;
}

async function applyDuelChoice(state, userId, choice, guildId) {
  state.choices[userId] = choice;

  if (!state.choices[state.ownerId] || !state.choices[state.opponentId]) {
    return { state, roundResolved: false };
  }

  const ownerChoice = state.choices[state.ownerId];
  const opponentChoice = state.choices[state.opponentId];
  const ownerResult = resultFor(ownerChoice, opponentChoice);

  if (ownerResult === 'win') state.scores.owner += 1;
  if (ownerResult === 'loss') state.scores.opponent += 1;

  await recordDuelRound(guildId, state.ownerId, state.opponentId, ownerResult).catch(() => null);

  state.lastRound = [
    `${participantName(state, 'owner')}: ${choiceText(ownerChoice)} | ${participantName(state, 'opponent')}: ${choiceText(opponentChoice)}`,
    explainRound(ownerChoice, opponentChoice, 'Player 1', 'Player 2'),
    ownerResult === 'tie'
      ? 'Result: **Tie**'
      : `Result: **${ownerResult === 'win' ? `<@${state.ownerId}>` : `<@${state.opponentId}>`} wins the round**`
  ].join('\n');

  state.choices = {};
  finishIfNeeded(state);
  if (state.status === 'active') state.round += 1;

  return { state, roundResolved: true };
}

function resetState(state) {
  return {
    ...state,
    round: 1,
    scores: { owner: 0, opponent: 0, bot: 0 },
    choices: {},
    status: 'active',
    lastRound: null,
    winnerId: null
  };
}

function canControl(interaction, state) {
  if ([state.ownerId, state.opponentId].filter(Boolean).includes(interaction.user.id)) return true;
  return Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages));
}

function ephemeralPayload(interaction, type, text) {
  const payload = respond.buildPayload(type, interaction.user, text, {
    message: {
      member: interaction.member,
      guild: interaction.guild
    },
    allowedMentions: { parse: [] }
  });
  payload.flags = MessageFlags.Ephemeral;
  return payload;
}

async function startInteractiveMatch(message, options = {}) {
  const state = makeState(options);
  const payload = payloadFor(state, message);

  if (message.channel?.send) {
    return message.channel.send(payload);
  }

  return message.reply?.(payload);
}

async function quickThrow(message, choice) {
  const botChoice = randomChoice();
  const result = resultFor(choice, botChoice);
  const stats = await recordSoloRound(message.guild.id, message.author.id, result).catch(() => null);

  return respond.reply(message, result === 'win' ? 'good' : result === 'loss' ? 'bad' : 'alert', null, {
    mentionUser: false,
    allowTitle: true,
    title: `Rock Paper Scissors · ${resultWord(result)}`,
    description: [
      `${message.author}: ${choiceText(choice)}`,
      `Rumi: ${choiceText(botChoice)}`,
      '',
      explainRound(choice, botChoice, 'You', 'Rumi'),
      stats ? `\nYour record: **${stats.wins}W / ${stats.losses}L / ${stats.ties}T** · Best streak: **${stats.bestStreak}**` : ''
    ].filter(Boolean).join('\n'),
    footer: { text: 'Run rps with no move to open the button arena.' }
  });
}

function formatPercent(numerator, denominator) {
  if (!denominator) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

async function showStats(message, user) {
  const target = user || message.author;
  const stats = await getStats(message.guild.id, target.id);
  const decisive = stats.wins + stats.losses;

  return respond.reply(message, 'info', null, {
    mentionUser: false,
    allowTitle: true,
    title: `${target.username || target.tag || 'Player'}'s RPS stats`,
    thumbnail: target.displayAvatarURL?.({ size: 128 }) || undefined,
    fields: [
      { name: 'Record', value: `**${stats.wins}W / ${stats.losses}L / ${stats.ties}T**`, inline: true },
      { name: 'Win rate', value: `**${formatPercent(stats.wins, decisive)}**`, inline: true },
      { name: 'Played', value: `**${stats.played}** rounds`, inline: true },
      { name: 'Current streak', value: `**${stats.currentStreak}**`, inline: true },
      { name: 'Best streak', value: `**${stats.bestStreak}**`, inline: true },
      { name: 'Last played', value: stats.lastPlayedAt ? `<t:${Math.floor(new Date(stats.lastPlayedAt).getTime() / 1000)}:R>` : '`never`', inline: true }
    ]
  });
}

async function showLeaderboard(message) {
  const rows = await db.listKv(statsNamespace(message.guild.id), 50).catch(() => []);
  const ranked = rows
    .map((row) => ({ userId: row.key, stats: { ...defaultStats(), ...(row.value || {}) } }))
    .filter((row) => row.stats.played > 0)
    .sort((left, right) => {
      if (right.stats.wins !== left.stats.wins) return right.stats.wins - left.stats.wins;
      if (right.stats.bestStreak !== left.stats.bestStreak) return right.stats.bestStreak - left.stats.bestStreak;
      return right.stats.played - left.stats.played;
    })
    .slice(0, 10);

  return respond.reply(message, 'list', null, {
    mentionUser: false,
    allowTitle: true,
    title: 'RPS leaderboard',
    description: ranked.length
      ? ranked.map((row, index) => {
        const decisive = row.stats.wins + row.stats.losses;
        return `**${index + 1}.** <@${row.userId}> — **${row.stats.wins}W** / ${row.stats.losses}L / ${row.stats.ties}T · ${formatPercent(row.stats.wins, decisive)} WR · best streak ${row.stats.bestStreak}`;
      }).join('\n')
      : 'No RPS games have been played in this server yet.'
  });
}

async function handleRpsInteraction(interaction) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith(`${SESSION_PREFIX}:`)) return false;

  const [, sessionId, type, rawAction] = interaction.customId.split(':');
  const state = getSession(SESSION_PREFIX, sessionId);

  if (!state) {
    await interaction.reply(ephemeralPayload(interaction, 'bad', 'That RPS match expired. Start a new one with `rps`.')).catch(() => null);
    return true;
  }

  if (type === 'control') {
    if (!canControl(interaction, state)) {
      await interaction.reply(ephemeralPayload(interaction, 'bad', 'Only the players or members with Manage Messages can control this match.')).catch(() => null);
      return true;
    }

    if (rawAction === 'close') {
      deleteSession(SESSION_PREFIX, sessionId);
      await interaction.deferUpdate().catch(() => null);
      await interaction.message.edit({ components: [] }).catch(() => null);
      return true;
    }

    if (rawAction === 'rematch') {
      const next = updateSession(SESSION_PREFIX, sessionId, resetState(state));
      await interaction.deferUpdate().catch(() => null);
      await interaction.message.edit(payloadFor(next, interaction)).catch(() => null);
      return true;
    }

    if (rawAction === 'forfeit' && state.status === 'active') {
      if (state.mode === 'solo') {
        if (interaction.user.id !== state.ownerId) {
          await interaction.reply(ephemeralPayload(interaction, 'bad', 'Only the player can forfeit this match.')).catch(() => null);
          return true;
        }
        state.status = 'finished';
        state.winnerId = 'bot';
        state.lastRound = `<@${state.ownerId}> forfeited. Rumi wins the match.`;
        await recordSoloRound(interaction.guildId, state.ownerId, 'loss').catch(() => null);
      } else {
        if (![state.ownerId, state.opponentId].includes(interaction.user.id)) {
          await interaction.reply(ephemeralPayload(interaction, 'bad', 'Only one of the duel players can forfeit this match.')).catch(() => null);
          return true;
        }
        const winnerId = interaction.user.id === state.ownerId ? state.opponentId : state.ownerId;
        state.status = 'finished';
        state.winnerId = winnerId;
        state.lastRound = `<@${interaction.user.id}> forfeited. <@${winnerId}> wins the match.`;
        await recordStats(interaction.guildId, winnerId, 'win').catch(() => null);
        await recordStats(interaction.guildId, interaction.user.id, 'loss').catch(() => null);
      }

      const next = updateSession(SESSION_PREFIX, sessionId, state);
      await interaction.deferUpdate().catch(() => null);
      await interaction.message.edit(payloadFor(next, interaction)).catch(() => null);
      return true;
    }

    return true;
  }

  if (type !== 'choice') return false;

  if (state.status !== 'active') {
    await interaction.reply(ephemeralPayload(interaction, 'info', 'This match is already over. Hit rematch to play again.')).catch(() => null);
    return true;
  }

  const choice = rawAction === 'random' ? randomChoice() : normalizeChoice(rawAction);
  if (!choice) {
    await interaction.reply(ephemeralPayload(interaction, 'bad', 'That move is not valid.')).catch(() => null);
    return true;
  }

  if (state.mode === 'solo') {
    if (interaction.user.id !== state.ownerId) {
      await interaction.reply(ephemeralPayload(interaction, 'bad', 'This is not your arena. Start your own with `rps`.')).catch(() => null);
      return true;
    }

    await applySoloChoice(state, choice, interaction.guildId);
    const next = updateSession(SESSION_PREFIX, sessionId, state);
    await interaction.deferUpdate().catch(() => null);
    await interaction.message.edit(payloadFor(next, interaction)).catch(() => null);
    return true;
  }

  if (![state.ownerId, state.opponentId].includes(interaction.user.id)) {
    await interaction.reply(ephemeralPayload(interaction, 'bad', 'Only the two duel players can choose moves here.')).catch(() => null);
    return true;
  }

  if (state.choices[interaction.user.id]) {
    await interaction.reply(ephemeralPayload(interaction, 'info', 'Your move is already locked for this round.')).catch(() => null);
    return true;
  }

  const result = await applyDuelChoice(state, interaction.user.id, choice, interaction.guildId);
  const next = updateSession(SESSION_PREFIX, sessionId, result.state);

  if (result.roundResolved) {
    await interaction.deferUpdate().catch(() => null);
    await interaction.message.edit(payloadFor(next, interaction)).catch(() => null);
  } else {
    await interaction.reply(ephemeralPayload(interaction, 'good', `Locked in ${choiceText(choice)}. Waiting for the other player.`)).catch(() => null);
    await interaction.message.edit(payloadFor(next, interaction)).catch(() => null);
  }

  return true;
}

function helpText(prefix) {
  return [
    `\`${prefix}rps\` — open the button arena against Rumi.`,
    `\`${prefix}rps rock\` — throw instantly.`,
    `\`${prefix}rps play bo5\` — play an interactive best-of-5 match.`,
    `\`${prefix}rps challenge @user bo3\` — secret-pick duel.`,
    `\`${prefix}rps stats [@user]\` — view stats.`,
    `\`${prefix}rps leaderboard\` — server leaderboard.`
  ].join('\n');
}

module.exports = {
  name: 'rps',
  aliases: ['rockpaperscissors', 'rock-paper-scissors'],
  category: 'fun',
  description: 'Play an advanced Rock Paper Scissors arena with buttons, duels, streaks, and stats.',
  usage: 'rps [rock|paper|scissors|play|challenge|stats|leaderboard]',
  examples: [
    'rps',
    'rps rock',
    'rps play bo5',
    'rps challenge @user bo3',
    'rps stats',
    'rps leaderboard'
  ],
  guildOnly: true,
  slash: true,
  cooldown: 3,
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  subcommands: [
    {
      name: 'play',
      description: 'Start a button-based match against Rumi.',
      usage: 'rps play [bo1|bo3|bo5|bo7|bo9]',
      examples: ['rps play', 'rps play bo5']
    },
    {
      name: 'throw',
      aliases: ['choose'],
      description: 'Throw rock, paper, or scissors instantly.',
      usage: 'rps throw <rock|paper|scissors|random>',
      examples: ['rps throw rock']
    },
    {
      name: 'challenge',
      aliases: ['duel', 'vs'],
      description: 'Challenge another member to a secret-pick RPS duel.',
      usage: 'rps challenge @user [bo1|bo3|bo5|bo7|bo9]',
      examples: ['rps challenge @user bo3']
    },
    {
      name: 'stats',
      description: 'View RPS stats for yourself or another user.',
      usage: 'rps stats [@user]',
      examples: ['rps stats', 'rps stats @user']
    },
    {
      name: 'leaderboard',
      aliases: ['lb', 'top'],
      description: 'View the RPS server leaderboard.',
      usage: 'rps leaderboard',
      examples: ['rps leaderboard']
    }
  ],

  async execute({ client, message, args, prefix }) {
    const commandPrefix = prefix || message.prefix || ',';
    const first = String(args[0] || '').toLowerCase();

    if (!first) {
      return startInteractiveMatch(message, {
        ownerId: message.author.id,
        bestOf: 3,
        mode: 'solo'
      });
    }

    if (['help', '?'].includes(first)) {
      return respond.reply(message, 'info', helpText(commandPrefix), { mentionUser: false });
    }

    const directChoice = normalizeChoice(first);
    if (directChoice) {
      return quickThrow(message, directChoice);
    }

    args.shift();

    if (['play', 'solo', 'arena'].includes(first)) {
      return startInteractiveMatch(message, {
        ownerId: message.author.id,
        bestOf: parseBestOf(args, 3),
        mode: 'solo'
      });
    }

    if (['throw', 'choose', 'pick'].includes(first)) {
      const choice = normalizeChoice(args[0]);
      if (!choice) {
        return respond.reply(message, 'info', `Choose \`rock\`, \`paper\`, \`scissors\`, or \`random\`.`, {
          mentionUser: false
        });
      }
      return quickThrow(message, choice);
    }

    if (['challenge', 'duel', 'vs'].includes(first)) {
      const rawUser = args.shift();
      const user = await resolveUser(client, rawUser);

      if (!user) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}rps challenge @user [bo3]\`.`, {
          mentionUser: false
        });
      }

      if (user.bot) {
        return respond.reply(message, 'bad', 'Challenge a real member, not a bot.', { mentionUser: false });
      }

      if (user.id === message.author.id) {
        return respond.reply(message, 'info', 'You cannot duel yourself — opening a solo arena instead.', {
          mentionUser: false
        }).then(() => startInteractiveMatch(message, {
          ownerId: message.author.id,
          bestOf: parseBestOf(args, 3),
          mode: 'solo'
        }));
      }

      return startInteractiveMatch(message, {
        ownerId: message.author.id,
        opponentId: user.id,
        bestOf: parseBestOf(args, 3),
        mode: 'duel'
      });
    }

    if (['stats', 'stat', 'profile'].includes(first)) {
      const user = args[0] ? await resolveUser(client, args[0]).catch(() => null) : null;
      return showStats(message, user || message.author);
    }

    if (['leaderboard', 'lb', 'top'].includes(first)) {
      return showLeaderboard(message);
    }

    return respond.reply(message, 'info', helpText(commandPrefix), { mentionUser: false });
  },

  handleRpsInteraction
};
