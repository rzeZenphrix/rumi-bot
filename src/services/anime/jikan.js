const API_BASE = 'https://api.jikan.moe/v4';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value = '', max = 900) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function joinNames(items = [], fallback = 'Unknown') {
  const names = (items || []).map((item) => item?.name).filter(Boolean);
  return names.length ? names.join(', ') : fallback;
}

function imageUrl(item = {}) {
  return item.images?.jpg?.large_image_url ||
    item.images?.jpg?.image_url ||
    item.images?.webp?.large_image_url ||
    item.images?.webp?.image_url ||
    null;
}

async function jikanFetch(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RumiBot/1.0 Jikan'
    }
  }).catch(() => null);

  if (!response) {
    const error = new Error('Anime/manga lookup request failed.');
    error.code = 'JIKAN_NETWORK_FAILED';
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.message || `Jikan returned HTTP ${response.status}.`);
    error.code = 'JIKAN_API_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function searchAnime(query, limit = 10) {
  const payload = await jikanFetch('/anime', {
    q: query,
    limit,
    order_by: 'score',
    sort: 'desc',
    sfw: true
  });

  return payload.data || [];
}

async function searchManga(query, limit = 10) {
  const payload = await jikanFetch('/manga', {
    q: query,
    limit,
    order_by: 'score',
    sort: 'desc',
    sfw: true
  });

  return payload.data || [];
}

function animePage(item, index, total, query) {
  return {
    title: `Anime Finder | ${item.title_english || item.title || 'Unknown anime'}`,
    allowTitle: true,
    thumbnail: imageUrl(item),
    description: [
      truncate(item.synopsis || 'No synopsis available.', 850),
      '',
      item.url
    ].join('\n').slice(0, 2000),
    fields: [
      {
        name: 'Result',
        value: `${index + 1}/${total}`,
        inline: true
      },
      {
        name: 'Score',
        value: item.score ? String(item.score) : 'n/a',
        inline: true
      },
      {
        name: 'Episodes',
        value: item.episodes ? String(item.episodes) : 'Unknown',
        inline: true
      },
      {
        name: 'Type',
        value: item.type || 'Unknown',
        inline: true
      },
      {
        name: 'Status',
        value: item.status || 'Unknown',
        inline: true
      },
      {
        name: 'Year',
        value: item.year ? String(item.year) : item.aired?.string || 'Unknown',
        inline: true
      },
      {
        name: 'Genres',
        value: truncate(joinNames(item.genres, 'Unknown'), 240),
        inline: false
      },
      {
        name: 'Studios',
        value: truncate(joinNames(item.studios, 'Unknown'), 240),
        inline: false
      }
    ],
    footer: {
      text: `Search: ${query} • Source: Jikan/MAL`
    },
    mentionUser: false
  };
}

function mangaPage(item, index, total, query) {
  return {
    title: `Manga Finder | ${item.title_english || item.title || 'Unknown manga'}`,
    allowTitle: true,
    thumbnail: imageUrl(item),
    description: [
      truncate(item.synopsis || 'No synopsis available.', 850),
      '',
      item.url
    ].join('\n').slice(0, 2000),
    fields: [
      {
        name: 'Result',
        value: `${index + 1}/${total}`,
        inline: true
      },
      {
        name: 'Score',
        value: item.score ? String(item.score) : 'n/a',
        inline: true
      },
      {
        name: 'Chapters',
        value: item.chapters ? String(item.chapters) : 'Unknown',
        inline: true
      },
      {
        name: 'Volumes',
        value: item.volumes ? String(item.volumes) : 'Unknown',
        inline: true
      },
      {
        name: 'Type',
        value: item.type || 'Unknown',
        inline: true
      },
      {
        name: 'Status',
        value: item.status || 'Unknown',
        inline: true
      },
      {
        name: 'Authors',
        value: truncate(joinNames(item.authors, 'Unknown'), 240),
        inline: false
      },
      {
        name: 'Genres',
        value: truncate(joinNames(item.genres, 'Unknown'), 240),
        inline: false
      }
    ],
    footer: {
      text: `Search: ${query} • Source: Jikan/MAL`
    },
    mentionUser: false
  };
}

module.exports = {
  searchAnime,
  searchManga,
  animePage,
  mangaPage
};