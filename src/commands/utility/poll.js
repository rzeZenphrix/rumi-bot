const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

const LETTERS = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];
const YES_NO = ['✅', '❌'];

function clean(text, max = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parsePipePoll(args) {
  const raw = args.join(' ').trim();
  const parts = raw.split('|').map((x) => clean(x, 240)).filter(Boolean);

  if (parts.length < 3) {
    return null;
  }

  return {
    question: parts[0].slice(0, 256),
    options: parts.slice(1, 11).map((option) => option.slice(0, 160))
  };
}

function usage(prefix = ',') {
  return [
    `Use \`${prefix}poll create <question> | <option 1> | <option 2>\`.`,
    `Example: \`${prefix}poll create Best color? | Red | Blue | Purple\``,
    '',
    `Quick yes/no: \`${prefix}poll yesno Should we host a giveaway?\``
  ].join('\n');
}

function buildPollPayload({ question, options, author, type = 'choice' }) {
  const optionLines = options.map((option, index) => {
    const emoji = type === 'yesno' ? YES_NO[index] : LETTERS[index];
    return `${emoji} **${option}**`;
  });

  return {
    title: type === 'yesno' ? 'Community Vote' : 'Community Poll',
    allowTitle: true,
    mentionUser: false,
    description: [
      `### ${question}`,
      '',
      optionLines.join('\n'),
      '',
      '> React below to cast your vote. You can change your reaction anytime.'
    ].join('\n'),
    fields: [
      {
        name: 'Created by',
        value: `${author}`,
        inline: true
      },
      {
        name: 'Options',
        value: String(options.length),
        inline: true
      },
      {
        name: 'Voting style',
        value: type === 'yesno' ? 'Yes / No' : 'Reaction choice',
        inline: true
      }
    ],
    footer: {
      text: 'Rumi Polls • Results are based on reactions'
    }
  };
}

module.exports = {
  name: 'poll',
  aliases: ['polls'],
  category: 'community',
  description: 'Create clean reaction polls for your community.',
  usage: 'poll <create|yesno|help> ...',
  examples: [
    'poll create Best color? | Red | Blue | Purple',
    'poll yesno Should we host a giveaway?',
    'poll help'
  ],
  guildOnly: true,
  slash: true,
  botPermissions: [
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.EmbedLinks
  ],
  subcommands: [
    {
      name: 'create',
      aliases: ['new'],
      description: 'Create a multi-option reaction poll.',
      usage: 'poll create <question> | <option 1> | <option 2> [| option 3]',
      examples: ['poll create Best game? | Minecraft | Fortnite | Roblox']
    },
    {
      name: 'yesno',
      aliases: ['yn'],
      description: 'Create a quick yes/no poll.',
      usage: 'poll yesno <question>',
      examples: ['poll yesno Should we host movie night?']
    },
    {
      name: 'help',
      description: 'Show poll command usage.',
      usage: 'poll help',
      examples: ['poll help']
    }
  ],

  async execute({ message, args, prefix }) {
    const sub = String(args.shift() || 'create').toLowerCase();
    const commandPrefix = prefix || message.prefix || ',';

    if (sub === 'help') {
      return respond.reply(message, 'info', usage(commandPrefix), {
        mentionUser: false
      });
    }

    if (sub === 'yesno' || sub === 'yn') {
      const question = clean(args.join(' '), 256);

      if (!question) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}poll yesno <question>\`.`, {
          mentionUser: false
        });
      }

      const sent = await respond.reply(
        message,
        'info',
        null,
        buildPollPayload({
          question,
          options: ['Yes', 'No'],
          author: message.author,
          type: 'yesno'
        })
      );

      for (const emoji of YES_NO) {
        await sent.react(emoji).catch(() => null);
      }

      return sent;
    }

    if (sub !== 'create' && sub !== 'new') {
      args.unshift(sub);
    }

    const parsed = parsePipePoll(args);

    if (!parsed) {
      return respond.reply(message, 'info', usage(commandPrefix), {
        mentionUser: false
      });
    }

    const sent = await respond.reply(
      message,
      'info',
      null,
      buildPollPayload({
        question: parsed.question,
        options: parsed.options,
        author: message.author,
        type: 'choice'
      })
    );

    for (let i = 0; i < parsed.options.length; i += 1) {
      await sent.react(LETTERS[i]).catch(() => null);
    }

    return sent;
  }
};
