const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function getYouTubeKey() {
  return process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY || '';
}

function extractVideoId(input = '') {
  const text = String(input || '').trim();
  const direct = text.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return direct?.[1] || null;
}

function formatCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-GB').format(number);
}

function formatDuration(iso = '') {
  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 'Unknown';

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const parts = [hours, minutes, seconds];

  if (!hours) parts.shift();
  return parts.map((part, index) => String(part).padStart(index === 0 && !hours ? 1 : 2, '0')).join(':');
}

async function fetchVideos(videoIds, key) {
  const ids = [...new Set((videoIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', key);

  const payload = await fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const byId = new Map((payload?.items || []).map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function searchVideoIds(query, key, options = {}) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(options.maxResults || 6));
  url.searchParams.set('safeSearch', options.safeSearch || 'moderate');
  url.searchParams.set('key', key);

  if (options.relatedToVideoId) {
    url.searchParams.set('relatedToVideoId', options.relatedToVideoId);
  } else {
    url.searchParams.set('q', query);
  }

  const payload = await fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  return (payload?.items || []).map((item) => item?.id?.videoId).filter(Boolean);
}

function buildVideoPage(video, footerText) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const duration = formatDuration(video.contentDetails?.duration || '');
  const published = snippet.publishedAt ? `<t:${Math.floor(new Date(snippet.publishedAt).getTime() / 1000)}:D>` : 'Unknown';
  const description = String(snippet.description || '').trim();

  return {
    title: `YouTube | ${snippet.title || 'Video'}`,
    allowTitle: true,
    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null,
    description: [
      description ? `${description.slice(0, 900)}${description.length > 900 ? '...' : ''}` : 'No video description provided.',
      `https://www.youtube.com/watch?v=${video.id}`
    ].join('\n\n'),
    fields: [
      {
        name: 'Channel',
        value: snippet.channelTitle || 'Unknown',
        inline: true
      },
      {
        name: 'Duration',
        value: duration,
        inline: true
      },
      {
        name: 'Published',
        value: published,
        inline: true
      },
      {
        name: 'Views',
        value: formatCount(stats.viewCount),
        inline: true
      },
      {
        name: 'Likes',
        value: formatCount(stats.likeCount),
        inline: true
      },
      {
        name: 'Comments',
        value: formatCount(stats.commentCount),
        inline: true
      }
    ],
    footer: {
      text: footerText
    },
    mentionUser: false
  };
}

module.exports = {
  name: 'youtube',
  aliases: ['yt'],
  category: 'utility',
  description: 'Search YouTube or browse related videos from a link.',
  usage: 'youtube <query-or-url>',
  examples: ['youtube lofi mix', 'youtube https://youtu.be/dQw4w9WgXcQ'],
  typing: true,

  async execute({ message, args }) {
    const input = args.join(' ').trim();
    if (!input) return respond.reply(message, 'info', 'Use `youtube <query-or-url>`.');

    const key = getYouTubeKey();
    if (!key) {
      return respond.reply(message, 'bad', 'YouTube search needs `GOOGLE_API_KEY`. `YOUTUBE_API_KEY` is only kept as a fallback.');
    }

    const linkedVideoId = extractVideoId(input);
    let header = '';
    let videoIds = [];

    if (linkedVideoId) {
      header = 'Original video first, then related picks.';
      const relatedIds = await searchVideoIds(null, key, {
        relatedToVideoId: linkedVideoId,
        maxResults: 5
      });
      videoIds = [linkedVideoId, ...relatedIds.filter((id) => id !== linkedVideoId)];
    } else {
      header = `Top YouTube results for "${input}".`;
      videoIds = await searchVideoIds(input, key, {
        maxResults: 6
      });
    }

    if (!videoIds.length) {
      return respond.reply(message, 'bad', 'I could not find any YouTube results for that.');
    }

    const videos = await fetchVideos(videoIds, key);
    if (!videos.length) {
      return respond.reply(message, 'bad', 'I could not fetch those YouTube results right now.');
    }

    const pages = videos.map((video, index) => buildVideoPage(
      video,
      index === 0 && linkedVideoId
        ? `Page 1/${videos.length} - ${header}`
        : `Page ${index + 1}/${videos.length} - ${header}`
    ));

    const payload = createPagedMessage({
      prefix: 'youtube',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
