const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const {
  createSession,
  getSession,
  updateSession,
  deleteSession
} = require('../../utils/interactionSessions');

const SESSION_PREFIX = 'ttt';
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.every(Boolean) ? 'draw' : null;
}

function availableMoves(board) {
  return board
    .map((value, index) => (value ? null : index))
    .filter((value) => value !== null);
}

function bestBotMove(board) {
  const moves = availableMoves(board);

  for (const move of moves) {
    const test = [...board];
    test[move] = 'O';
    if (checkWinner(test) === 'O') return move;
  }

  for (const move of moves) {
    const test = [...board];
    test[move] = 'X';
    if (checkWinner(test) === 'X') return move;
  }

  if (moves.includes(4)) return 4;
  const corners = [0, 2, 6, 8].filter((move) => moves.includes(move));
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return moves[Math.floor(Math.random() * moves.length)];
}

function makeState(ownerId, opponentId = null) {
  const sessionId = createSession(SESSION_PREFIX, {
    ownerId,
    opponentId,
    vsBot: !opponentId,
    board: Array(9).fill(null),
    turn: 'X',
    status: 'active',
    winner: null
  });

  return getSession(SESSION_PREFIX, sessionId);
}

function describeState(state) {
  if (state.status === 'won') {
    if (state.winner === 'X') return `<@${state.ownerId}> wins.`;
    if (state.vsBot) return 'Rumi wins this round.';
    return `<@${state.opponentId}> wins.`;
  }

  if (state.status === 'draw') {
    return 'It is a draw.';
  }

  if (state.turn === 'X') {
    return state.vsBot
      ? `Your move, <@${state.ownerId}>.`
      : `Your move, <@${state.ownerId}>.`;
  }

  return state.vsBot
    ? 'Rumi is thinking...'
    : `Your move, <@${state.opponentId}>.`;
}

function cellButton(sessionId, board, index, active) {
  const value = board[index];
  const label = value || '·';
  const style = value === 'X'
    ? ButtonStyle.Primary
    : value === 'O'
      ? ButtonStyle.Danger
      : ButtonStyle.Secondary;

  return new ButtonBuilder()
    .setCustomId(`${SESSION_PREFIX}:${sessionId}:move:${index}`)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(Boolean(value) || !active);
}

function buildBoardRows(state) {
  const rows = [];

  for (let row = 0; row < 3; row += 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        cellButton(state.id, state.board, (row * 3) + 0, state.status === 'active'),
        cellButton(state.id, state.board, (row * 3) + 1, state.status === 'active'),
        cellButton(state.id, state.board, (row * 3) + 2, state.status === 'active')
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:restart`)
        .setLabel('New Game')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:resign`)
        .setLabel(state.status === 'active' ? 'Resign' : 'Close')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

function buildPayload(state) {
  return {
    mentionUser: false,
    allowTitle: true,
    title: 'Tic Tac Toe',
    description: describeState(state),
    fields: [
      {
        name: 'Match',
        value: state.vsBot
          ? `<@${state.ownerId}> vs Rumi`
          : `<@${state.ownerId}> vs <@${state.opponentId}>`,
        inline: false
      }
    ],
    components: buildBoardRows(state)
  };
}

function applyMove(state, index, symbol) {
  if (state.board[index] || state.status !== 'active') return state;
  state.board[index] = symbol;

  const winner = checkWinner(state.board);
  if (winner === 'draw') {
    state.status = 'draw';
    state.winner = 'draw';
    return state;
  }

  if (winner) {
    state.status = 'won';
    state.winner = winner;
    return state;
  }

  state.turn = symbol === 'X' ? 'O' : 'X';
  return state;
}

async function handleTicTacToeInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${SESSION_PREFIX}:`)) {
    return false;
  }

  const [, sessionId, action, rawIndex] = interaction.customId.split(':');
  const state = getSession(SESSION_PREFIX, sessionId);

  if (!state) {
    await interaction.reply({
      content: 'That tic tac toe game expired. Start a new one with `tictactoe`.',
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const isOwner = interaction.user.id === state.ownerId;
  const isOpponent = interaction.user.id === state.opponentId;

  if (!isOwner && !isOpponent) {
    await interaction.reply({
      content: 'This game belongs to someone else.',
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (action === 'resign') {
    deleteSession(SESSION_PREFIX, sessionId);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => null);
    }
    await interaction.message.edit({ components: [] }).catch(() => null);
    return true;
  }

  let next = state;

  if (action === 'restart') {
    next = updateSession(SESSION_PREFIX, sessionId, {
      board: Array(9).fill(null),
      turn: 'X',
      status: 'active',
      winner: null
    });
  } else if (action === 'move' && state.status === 'active') {
    const index = Number(rawIndex);
    const expectedUserId = state.turn === 'X' ? state.ownerId : (state.vsBot ? state.ownerId : state.opponentId);

    if (interaction.user.id !== expectedUserId) {
      await interaction.reply({
        content: state.vsBot
          ? 'Wait for your turn.'
          : 'It is not your turn yet.',
        ephemeral: true
      }).catch(() => null);
      return true;
    }

    applyMove(state, index, state.turn);

    if (state.vsBot && state.status === 'active' && state.turn === 'O') {
      const move = bestBotMove(state.board);
      if (Number.isInteger(move)) {
        applyMove(state, move, 'O');
      }
    }

    next = updateSession(SESSION_PREFIX, sessionId, {
      board: state.board,
      turn: state.turn,
      status: state.status,
      winner: state.winner
    });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const payload = respond.buildPayload('info', interaction.user, null, buildPayload(next));
  await interaction.message.edit(payload).catch(async () => {
    await interaction.editReply(payload).catch(() => null);
  });

  return true;
}

module.exports = {
  name: 'tictactoe',
  aliases: ['ttt', 'xo'],
  category: 'fun',
  description: 'Play an interactive game of tic tac toe.',
  usage: 'tictactoe [@user|userId]',
  examples: ['tictactoe', 'tictactoe @friend'],

  async execute({ client, message, args }) {
    const target = await resolveUser(client, args[0]).catch(() => null);
    const opponentId = target && !target.bot && target.id !== message.author.id ? target.id : null;
    const state = makeState(message.author.id, opponentId);
    return respond.reply(message, 'info', null, buildPayload(state));
  },

  handleTicTacToeInteraction
};
