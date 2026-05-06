const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');
const standardSearch = require('../../services/google/search');

function truncate(value = '', max = 900) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function buildResultPage(result, index, total, meta) {
  const source = result.source || result.displayLink || 'Unknown source';

  return {
    title: `Search Result ${index + 1}/${total}`,
    allowTitle: true,
    author: {
      name: result.title.slice(0, 256)
    },
    description: [
      `**${result.title}**`,
      '',
      truncate(result.snippet || 'No preview available.', 1100),
      '',
      `🔗 ${result.link}`
    ].join('\n').slice(0, 4000),
    fields: [
      {
        name: 'Source',
        value: truncate(source, 120),
        inline: true
      },
      {
        name: 'Provider',
        value: meta.provider || 'Standard web search',
        inline: true
      },
      {
        name: 'Results loaded',
        value: `${total}`,
        inline: true
      },
      {
        name: 'Query',
        value: truncate(meta.query, 240),
        inline: false
      }
    ],
    footer: {
      text: `Free standard search fallback • ${meta.sourceProvider || 'web'} • Page ${index + 1}/${total}`
    },
    mentionUser: false
  };
}

module.exports = {
  name: 'google',
  aliases: ['g', 'search', 'websearch'],
  category: 'utility',
  description: 'Search the web and browse detailed results in a paginated embed.',
  usage: 'google <search query>',
  examples: [
    'google how to get rich',
    'google how to use Lavalink with JDA 5',
    "google is Ryan Gosling gay?"
  ],
  typing: true,

  async execute({ message, args }) {
    const query = args.join(' ').trim();

    if (!query) {
      return respond.reply(message, 'info', `Use \`${message.prefix || ','}google <search query>\`.`);
    }

    const payload = await standardSearch.search(query, { limit: 10 }).catch((error) => ({ error }));

    if (payload.error) {
      return respond.reply(message, 'bad', `Search failed: ${payload.error.message || 'Unknown error'}`);
    }

    if (!payload.items.length) {
      return respond.reply(message, 'bad', `I could not find results for **${query}**.`);
    }

    const pages = payload.items.map((item, index) =>
      buildResultPage(item, index, payload.items.length, payload)
    );

    const pagePayload = createPagedMessage({
      prefix: 'google',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, pagePayload);
  }
};