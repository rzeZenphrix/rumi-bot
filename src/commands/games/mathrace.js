const respond = require('../../utils/respond');

const ROUND_MS = Math.max(5000, Number(process.env.MATHRACE_ROUND_MS || 25000));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeProblem(difficulty = 'normal') {
  const mode = String(difficulty || 'normal').toLowerCase();
  const hard = ['hard', 'difficult', 'advanced'].includes(mode);
  const medium = ['medium', 'normal'].includes(mode) || !hard;

  const templates = hard
    ? ['linear', 'mixed', 'multiplyAdd', 'squareDiff', 'division']
    : medium
      ? ['add', 'subtract', 'multiply', 'multiplyAdd', 'division']
      : ['add', 'subtract'];

  const type = templates[randomInt(0, templates.length - 1)];

  if (type === 'add') {
    const a = randomInt(15, 99);
    const b = randomInt(15, 99);
    return {
      question: `${a} + ${b}`,
      answer: a + b
    };
  }

  if (type === 'subtract') {
    const a = randomInt(40, 160);
    const b = randomInt(10, a - 5);
    return {
      question: `${a} - ${b}`,
      answer: a - b
    };
  }

  if (type === 'multiply') {
    const a = randomInt(6, hard ? 24 : 14);
    const b = randomInt(6, hard ? 24 : 14);
    return {
      question: `${a} × ${b}`,
      answer: a * b
    };
  }

  if (type === 'multiplyAdd') {
    const a = randomInt(4, hard ? 16 : 10);
    const b = randomInt(4, hard ? 16 : 10);
    const c = randomInt(5, hard ? 60 : 30);

    return {
      question: `(${a} × ${b}) + ${c}`,
      answer: (a * b) + c
    };
  }

  if (type === 'squareDiff') {
    const a = randomInt(8, 20);
    const b = randomInt(3, 12);

    return {
      question: `${a}² - ${b}²`,
      answer: (a * a) - (b * b)
    };
  }

  const divisor = randomInt(3, hard ? 14 : 10);
  const answer = randomInt(4, hard ? 30 : 18);
  const dividend = divisor * answer;

  return {
    question: `${dividend} ÷ ${divisor}`,
    answer
  };
}

function parseAnswer(content = '') {
  const cleaned = String(content || '')
    .trim()
    .replace(/,/g, '')
    .replace(/^answer\s*[:=-]?\s*/i, '');

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

module.exports = {
  name: 'mathrace',
  aliases: ['quickmath', 'mathfast', 'solvefast'],
  category: 'fun',
  description: 'Start a math race and detect the fastest correct answer.',
  usage: 'mathrace [easy|normal|hard]',
  examples: [
    'mathrace',
    'mathrace hard'
  ],
  guildOnly: true,
  cooldown: 8,

  async execute({ message, args }) {
    const channel = message.interaction?.channel || message.channel;

    if (!channel?.createMessageCollector) {
      return respond.reply(message, 'bad', 'Mathrace needs to be run from a normal text channel.');
    }

    const difficulty = args[0] || 'normal';
    const problem = makeProblem(difficulty);
    const startedAt = Date.now();

    await respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Math Race',
      description: [
        'First correct answer wins.',
        '',
        `**Solve:** \`${problem.question}\``,
        '',
        `Time limit: **${Math.round(ROUND_MS / 1000)}s**`
      ].join('\n')
    });

    const collector = channel.createMessageCollector({
      time: ROUND_MS,
      max: 1,
      filter: (entry) => {
        if (entry.author.bot) return false;
        if (entry.channelId !== channel.id) return false;

        const answer = parseAnswer(entry.content);
        return answer !== null && Math.abs(answer - problem.answer) < 0.000001;
      }
    });

    collector.on('collect', async (entry) => {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
      collector.stop('winner');

      await respond.send(channel, 'good', entry.author, null, {
        mentionUser: false,
        title: 'Math Race Winner',
        description: `${entry.author} solved it in **${seconds}s**.\n\n\`${problem.question} = ${problem.answer}\``
      });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'winner') return;

      await respond.send(channel, 'alert', message.author, null, {
        mentionUser: false,
        title: 'Math Race Ended',
        description: `Nobody solved it in time.\n\nCorrect answer: \`${problem.question} = ${problem.answer}\``
      });
    });

    return null;
  }
};