const { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
 } = require('discord.js');
const respond = require('../../utils/respond');
const {
  createSession,
  getSession,
  updateSession,
  deleteSession
} = require('../../utils/interactionSessions');

const SESSION_PREFIX = 'mines';
const SIZE = 4;
const MINE_COUNT = 4;

function buildBoard() {
  const cells = Array.from({ length: SIZE * SIZE }, () => ({
    mine: false,
    adjacent: 0
  }));

  const mineIndexes = new Set();
  while (mineIndexes.size < MINE_COUNT) {
    mineIndexes.add(Math.floor(Math.random() * cells.length));
  }

  for (const index of mineIndexes) {
    cells[index].mine = true;
  }

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index].mine) continue;
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    let adjacent = 0;

    for (let y = row - 1; y <= row + 1; y += 1) {
      for (let x = col - 1; x <= col + 1; x += 1) {
        if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) continue;
        if (y === row && x === col) continue;
        if (cells[(y * SIZE) + x].mine) adjacent += 1;
      }
    }

    cells[index].adjacent = adjacent;
  }

  return cells;
}

function summary(state) {
  const safeTotal = (SIZE * SIZE) - MINE_COUNT;
  if (state.status === 'won') {
    return `You cleared the whole board. Safe picks: **${state.safePicks}/${safeTotal}**.`;
  }
  if (state.status === 'lost') {
    return `Boom. You hit a mine after **${state.safePicks}** safe pick(s).`;
  }
  if (state.status === 'cashed') {
    return `You cashed out with **${state.safePicks}** safe pick(s).`;
  }
  return `Pick tiles and avoid the mines. Safe picks: **${state.safePicks}/${safeTotal}**.`;
}

function renderBoardRows(state, ownerId) {
  const rows = [];

  for (let row = 0; row < SIZE; row += 1) {
    const buttons = [];

    for (let col = 0; col < SIZE; col += 1) {
      const index = (row * SIZE) + col;
      const cell = state.board[index];
      const revealed = state.revealed.has(index) || state.status !== 'active';

      let label = '•';
      let style = ButtonStyle.Secondary;

      if (revealed && cell.mine) {
        label = '💣';
        style = ButtonStyle.Danger;
      } else if (revealed) {
        label = cell.adjacent > 0 ? String(cell.adjacent) : '·';
        style = ButtonStyle.Success;
      }

      buttons.push(
        new ButtonBuilder()
          .setCustomId(`${SESSION_PREFIX}:${state.id}:pick:${index}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(revealed || state.status !== 'active')
      );
    }

    rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:cashout`)
        .setLabel('Cash Out')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(state.status !== 'active' || state.safePicks === 0),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:restart`)
        .setLabel('New Board')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${SESSION_PREFIX}:${state.id}:close`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

function buildPayload(ownerId, state) {
  return {
    mentionUser: false,
    title: 'Mines',
    allowTitle: true,
    description: summary(state),
    fields: [
      {
        name: 'Board',
        value: `Owner: <@${ownerId}> | Mines: \`${MINE_COUNT}\` | Board: \`${SIZE}x${SIZE}\``,
        inline: false
      }
    ],
    components: renderBoardRows(state, ownerId)
  };
}

function createState(ownerId) {
  const sessionId = createSession(SESSION_PREFIX, {
    ownerId,
    board: buildBoard(),
    revealed: new Set(),
    safePicks: 0,
    status: 'active'
  });

  return getSession(SESSION_PREFIX, sessionId);
}

function revealCell(state, index) {
  if (state.revealed.has(index) || state.status !== 'active') return state;

  state.revealed.add(index);
  const cell = state.board[index];

  if (cell.mine) {
    state.status = 'lost';
    return state;
  }

  state.safePicks += 1;
  const safeTotal = (SIZE * SIZE) - MINE_COUNT;
  if (state.safePicks >= safeTotal) {
    state.status = 'won';
  }

  return state;
}

async function handleMinesInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${SESSION_PREFIX}:`)) {
    return false;
  }

  const [, sessionId, action, rawIndex] = interaction.customId.split(':');
  const state = getSession(SESSION_PREFIX, sessionId);

  if (!state) {
    await interaction.reply({
      content: 'That mines board expired. Start a new one with `mines`.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== state.ownerId) {
    await interaction.reply({
      content: 'Only the player who started this board can use it.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  if (action === 'close') {
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
      board: buildBoard(),
      revealed: new Set(),
      safePicks: 0,
      status: 'active'
    });
  } else if (action === 'cashout' && state.status === 'active') {
    next = updateSession(SESSION_PREFIX, sessionId, { status: 'cashed' });
  } else if (action === 'pick') {
    const index = Number(rawIndex);
    revealCell(state, index);
    next = updateSession(SESSION_PREFIX, sessionId, {
      revealed: state.revealed,
      safePicks: state.safePicks,
      status: state.status
    });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const payload = respond.buildPayload('info', interaction.user, null, buildPayload(state.ownerId, next));
  await interaction.message.edit(payload).catch(async () => {
    await interaction.editReply(payload).catch(() => null);
  });

  return true;
}

module.exports = {
  name: 'mines',
  aliases: ['minefield'],
  category: 'fun',
  description: 'Play an interactive mines board.',
  usage: 'mines',
  examples: ['mines'],

  async execute({ message }) {
    const state = createState(message.author.id);
    return respond.reply(message, 'info', null, buildPayload(message.author.id, state));
  },

  handleMinesInteraction
};
