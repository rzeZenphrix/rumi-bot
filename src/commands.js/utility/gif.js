const respond = require('../../utils/respond');
const { attachmentFromBuffer, fetchBuffer } = require('../../utils/media');

async function searchTenor(query) {
  const key = process.env.GOOGLE_API_KEY || process.env.google;
  if (!key) throw new Error('I need GOOGLE_API_KEY to search Tenor GIFs.');
  const endpoint = new URL('https://tenor.googleapis.com/v2/search');
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('q', query || 'random');
  endpoint.searchParams.set('limit', '20');
  endpoint.searchParams.set('media_filter', 'gif,mediumgif,tinygif');
  endpoint.searchParams.set('client_key', 'ohara-bot');
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Tenor returned HTTP ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

module.exports = {
  name: 'gif',
  aliases: ['tenor'],
  category: 'utility',
  description: 'I search Tenor using GOOGLE_API_KEY and send a GIF.',
  usage: 'gif <search|random> [query]',
  examples: ['gif search cat', 'gif random anime'],
  typing: true,

  async execute({ message, args }) {
    const sub = ['search', 'random'].includes(String(args[0] || '').toLowerCase()) ? args.shift().toLowerCase() : 'search';
    const query = args.join(' ').trim() || (sub === 'random' ? 'anime' : 'funny');
    try {
      const results = await searchTenor(query);
      if (!results.length) return respond.reply(message, 'bad', 'I could not find a GIF for that search.');
      const item = sub === 'random' ? results[Math.floor(Math.random() * results.length)] : results[0];
      const url = item.media_formats?.gif?.url || item.media_formats?.mediumgif?.url || item.media_formats?.tinygif?.url;
      if (!url) return respond.reply(message, 'bad', 'I found a result, but it did not include a GIF file.');
      const buffer = await fetchBuffer(url);
      return message.channel.send({ files: [attachmentFromBuffer(buffer, 'tenor.gif')], allowedMentions: { parse: [] } });
    } catch (error) {
      return respond.reply(message, 'bad', error?.message?.includes('GOOGLE_API_KEY')
        ? error.message
        : 'GIF search is having trouble right now. Please try again in a moment.');
    }
  }
};
