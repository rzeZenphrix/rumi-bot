const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function cleanUrban(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\r/g, '')
    .trim();
}

function chunkList(items = [], size = 8) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchDictionaryApi(term) {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`).catch(() => null);
  if (!response?.ok) return [];
  return response.json().catch(() => []);
}

async function fetchUrban(term) {
  const response = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`).catch(() => null);
  if (!response?.ok) return [];
  const payload = await response.json().catch(() => null);
  return payload?.list || [];
}

async function fetchRelated(term) {
  const response = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(term)}&max=12`).catch(() => null);
  if (!response?.ok) return [];
  return response.json().catch(() => []);
}

function buildPages(term, dictionaryEntries, urbanEntries, relatedEntries) {
  const pages = [];

  for (const entry of dictionaryEntries.slice(0, 3)) {
    for (const meaning of (entry.meanings || []).slice(0, 3)) {
      const defs = (meaning.definitions || []).slice(0, 3);
      if (!defs.length) continue;

      pages.push({
        title: `Definition | ${entry.word}`,
        allowTitle: true,
        description: defs
          .map((definition, index) => {
            const lines = [
              `**${index + 1}.** ${definition.definition || 'No definition provided.'}`
            ];
            if (definition.example) lines.push(`*Example:* ${definition.example}`);
            if (Array.isArray(definition.synonyms) && definition.synonyms.length) {
              lines.push(`*Synonyms:* ${definition.synonyms.slice(0, 6).join(', ')}`);
            }
            return lines.join('\n');
          })
          .join('\n\n'),
        fields: [
          {
            name: 'Part of speech',
            value: meaning.partOfSpeech || 'unknown',
            inline: false
          }
        ],
        footer: {
          text: 'Source: Free Dictionary API'
        }
      });
    }
  }

  for (const entry of urbanEntries.slice(0, 2)) {
    pages.push({
      title: `Urban usage | ${entry.word || term}`,
      allowTitle: true,
      description: cleanUrban(entry.definition).slice(0, 1800) || 'No definition provided.',
      fields: [
        entry.example
          ? {
              name: 'Example',
              value: cleanUrban(entry.example).slice(0, 900),
              inline: false
            }
          : null,
        {
          name: 'Votes',
          value: `👍 ${entry.thumbs_up || 0} | 👎 ${entry.thumbs_down || 0}`,
          inline: false
        }
      ].filter(Boolean),
      footer: {
        text: 'Source: Urban Dictionary'
      }
    });
  }

  if (relatedEntries.length) {
    for (const chunk of chunkList(relatedEntries, 8)) {
      pages.push({
        title: `Related words | ${term}`,
        allowTitle: true,
        description: chunk
          .map((item, index) => `**${index + 1}.** ${item.word}${item.tags?.length ? ` — ${item.tags.slice(0, 2).join(', ')}` : ''}`)
          .join('\n'),
        footer: {
          text: 'Source: Datamuse'
        }
      });
    }
  }

  return pages;
}

module.exports = {
  name: 'define',
  aliases: ['dictionary'],
  category: 'utility',
  description: 'Look up a word across multiple dictionary sources.',
  usage: 'define <word>',
  examples: ['define serendipity'],
  typing: true,

  async execute({ message, args }) {
    const term = args.join(' ').trim();
    if (!term) return respond.reply(message, 'info', 'Tell me the word to define.');

    const [dictionaryEntries, urbanEntries, relatedEntries] = await Promise.all([
      fetchDictionaryApi(term),
      fetchUrban(term),
      fetchRelated(term)
    ]);

    const pages = buildPages(term, dictionaryEntries, urbanEntries, relatedEntries);
    if (!pages.length) {
      return respond.reply(message, 'bad', 'I could not find anything useful for that word.');
    }

    const payload = createPagedMessage({
      prefix: 'define',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
