const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

const DEFAULT_ROUND_MS = Math.max(5000, Number(process.env.FASTTYPE_ROUND_MS || 20000));

const FALLBACK_PROMPTS = [
  'rumi types faster than the wind',
  'crystal castles glow under midnight rain',
  'the quick fox danced past the sleepy dragon',
  'discord messages travel through neon clouds',
  'tiny sparks can start legendary fires'
];

function normalizeAnswer(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function resolvePrompt(message, args) {
  const custom = args.join(' ').trim();
  if (custom) return custom.slice(0, 180);

  const prompt = await getPrompt('fasttype', { guildId: message.guild?.id }).catch(() => null);
  if (prompt?.ok && prompt.text) return String(prompt.text).slice(0, 180);

  return FALLBACK_PROMPTS[Math.floor(Math.random() * FALLBACK_PROMPTS.length)];
}

module.exports = {
  name: 'fasttype',
  aliases: ['typingtest', 'typefast', 'typerace'],
  category: 'fun',
  description: 'Start a typing race and detect the first correct typer.',
  usage: 'fasttype [custom phrase]',
  examples: [
    'fasttype',
    'fasttype rumi is the fastest bot'
  ],
  guildOnly: true,
  cooldown: 8,

  async execute({ message, args }) {
    const channel = message.interaction?.channel || message.channel;

    if (!channel?.createMessageCollector) {
      return respond.reply(message, 'bad', 'Fasttype needs to be run from a normal text channel.');
    }

    const phrase = await resolvePrompt(message, args);
    const normalized = normalizeAnswer(phrase);
    const startedAt = Date.now();

    await respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Fast Type Race',
      description: [
        'First person to type the phrase correctly wins.',
        '',
        `**Phrase:**\n\`${phrase}\``,
        '',
        `Time limit: **${Math.round(DEFAULT_ROUND_MS / 1000)}s**`
      ].join('\n')
    });

    const collector = channel.createMessageCollector({
      time: DEFAULT_ROUND_MS,
      filter: (entry) => {
        if (entry.author.bot) return false;
        if (entry.channelId !== channel.id) return false;
        return normalizeAnswer(entry.content) === normalized;
      },
      max: 1
    });

    collector.on('collect', async (entry) => {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
      collector.stop('winner');

      await respond.send(channel, 'good', entry.author, null, {
        mentionUser: false,
        title: 'Fast Type Winner',
        description: `${entry.author} typed it correctly in **${seconds}s**.\n\nPhrase: \`${phrase}\``
      });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'winner') return;

      await respond.send(channel, 'alert', message.author, null, {
        mentionUser: false,
        title: 'Fast Type Ended',
        description: `Nobody typed the phrase correctly in time.\n\nPhrase was: \`${phrase}\``
      });
    });

    return null;
  }
};