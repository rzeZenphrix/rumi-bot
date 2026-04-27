const respond = require('../../utils/respond');

function getYouTubeKey() {
  return process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY || '';
}

function extractVideoId(input = '') {
  const text = String(input || '').trim();
  const direct = text.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return direct?.[1] || null;
}

async function fetchVideo(videoId, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', key);

  const payload = await fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  return payload?.items?.[0] || null;
}

async function searchVideo(query, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('type', 'video');
  url.searchParams.set('safeSearch', 'moderate');
  url.searchParams.set('key', key);

  const payload = await fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const item = payload?.items?.[0];
  return item?.id?.videoId || null;
}

module.exports = {
  name: 'youtube',
  aliases: ['yt'],
  category: 'utility',
  description: 'Search YouTube or inspect a YouTube video.',
  usage: 'youtube <query-or-url>',

  async execute({ message, args }) {
    const input = args.join(' ').trim();
    if (!input) return respond.reply(message, 'info', 'Use `youtube <query-or-url>`.');

    const key = getYouTubeKey();
    if (!key) {
      return respond.reply(message, 'bad', 'YouTube search needs `GOOGLE_API_KEY`. `YOUTUBE_API_KEY` is only kept as a fallback.');
    }

    let videoId = extractVideoId(input);
    if (!videoId) {
      videoId = await searchVideo(input, key);
    }

    if (!videoId) {
      return respond.reply(message, 'bad', 'I could not find a YouTube video for that search.');
    }

    const video = await fetchVideo(videoId, key);
    if (!video) {
      return respond.reply(message, 'bad', 'I could not fetch that YouTube video right now.');
    }

    const snippet = video.snippet || {};
    const stats = video.statistics || {};

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        `**${snippet.title || 'YouTube Video'}**`,
        `Channel: **${snippet.channelTitle || 'Unknown'}**`,
        `Views: \`${stats.viewCount || '0'}\``,
        `Likes: \`${stats.likeCount || '0'}\``,
        `Published: \`${snippet.publishedAt ? snippet.publishedAt.slice(0, 10) : 'Unknown'}\``,
        `https://www.youtube.com/watch?v=${videoId}`
      ].join('\n'),
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null
    });
  }
};
