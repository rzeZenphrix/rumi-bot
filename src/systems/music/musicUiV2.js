const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder
} = require('discord.js');

const MUSIC_EMOJIS = {
  pause: '<:pause:1503313061568712734>',
  play: '<:play:1503313062428545056>',
  stop: '<:stop:1503335482984235049>',
  forward: '<:music_forward:1503335481893458050>',
  backward: '<:music_backward:1503335480656396421>'
};

const FALLBACK_EMOJIS = {
  pause: 'Ⅱ',
  play: '▶',
  stop: '■',
  forward: '»',
  backward: '«'
};

function clean(value, max = 1024) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_{}[\]()#+\-.!|>~])/g, '\\$1');
}

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function customEmoji(raw) {
  const match = String(raw || '').match(/^<(?<animated>a?):(?<name>[A-Za-z0-9_]{2,32}):(?<id>\d{17,20})>$/);
  if (!match) return null;

  return {
    id: match.groups.id,
    name: match.groups.name,
    animated: match.groups.animated === 'a'
  };
}

function canUseCustomEmoji(client, raw) {
  const parsed = customEmoji(raw);
  if (!parsed?.id) return false;

  return Boolean(client?.emojis?.cache?.has?.(parsed.id));
}

function emojiText(name, client = null) {
  const raw = MUSIC_EMOJIS[name];
  if (!raw) return FALLBACK_EMOJIS[name] || '';

  if (canUseCustomEmoji(client, raw)) return raw;

  return FALLBACK_EMOJIS[name] || '';
}

function emojiObject(name, client = null) {
  const raw = MUSIC_EMOJIS[name];
  const parsed = customEmoji(raw);

  if (!parsed) return undefined;
  if (!canUseCustomEmoji(client, raw)) return undefined;

  return parsed;
}

function stripCustomEmojiText(value) {
  return String(value || '')
    .replace(/<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function removeCodeTicks(value) {
  return String(value || '').replace(/`([^`]+)`/g, '$1');
}

function cleanMusicText(value, max = 1024) {
  return clean(removeCodeTicks(stripCustomEmojiText(value)), max);
}

function cleanMarkdownLine(value, max = 1000) {
  const text = removeCodeTicks(stripCustomEmojiText(value));
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function titleCase(value) {
  const text = cleanMusicText(value, 80);
  if (!text) return 'Music';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function meta(parts = []) {
  return parts
    .filter(Boolean)
    .map((part) => cleanMusicText(part, 80))
    .filter(Boolean)
    .join(' · ');
}

function text(content) {
  return new TextDisplayBuilder().setContent(String(content || '\u200B').slice(0, 4000));
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function payload(components) {
  return {
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
}

function sectionOrText(container, content, thumbnail) {
  const image = safeUrl(thumbnail);

  if (!image) {
    container.addTextDisplayComponents(text(content));
    return container;
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(image))
  );

  return container;
}

function linkButton(url, label = 'Open') {
  const href = safeUrl(url);
  if (!href) return null;

  return new ButtonBuilder()
    .setLabel(clean(label, 80))
    .setStyle(ButtonStyle.Link)
    .setURL(href);
}

function linkRow(buttons = []) {
  const validButtons = buttons.filter(Boolean).slice(0, 5);
  if (!validButtons.length) return null;

  return new ActionRowBuilder().addComponents(...validButtons);
}

function musicButtons(trackUrl, playlistUrl = null, client = null) {
  const buttons = [];

  const trackButton = linkButton(trackUrl, 'Open track');
  if (trackButton) {
    const playEmoji = emojiObject('play', client);
    if (playEmoji) trackButton.setEmoji(playEmoji);
    buttons.push(trackButton);
  }

  const playlistButton = playlistUrl && playlistUrl !== trackUrl
    ? linkButton(playlistUrl, 'Open playlist')
    : null;

  if (playlistButton) buttons.push(playlistButton);

  return linkRow(buttons);
}

function headerLine(label, emoji = null, client = null) {
  const icon = emoji ? emojiText(emoji, client) : '';
  const safeLabel = escapeMarkdown(titleCase(label));
  return `-# ${icon ? `${icon} ` : ''}${safeLabel}`;
}

function titleLine(title) {
  return `## ${escapeMarkdown(cleanMusicText(title || 'Unknown track', 120))}`;
}

function artistLine(artist, album = null) {
  const safeArtist = cleanMusicText(artist, 160);
  const safeAlbum = cleanMusicText(album, 160);

  if (!safeArtist && !safeAlbum) return null;
  if (safeArtist && safeAlbum) return `**${escapeMarkdown(safeArtist)}** · *${escapeMarkdown(safeAlbum)}*`;
  if (safeArtist) return `**${escapeMarkdown(safeArtist)}**`;
  return `*${escapeMarkdown(safeAlbum)}*`;
}

function smallLine(value) {
  const safe = cleanMusicText(value, 240);
  return safe ? `-# ${escapeMarkdown(safe)}` : null;
}

function trackCard({
  eyebrow = 'Now playing',
  emoji = null,
  client = null,
  user = null,
  title,
  artist,
  album,
  url,
  thumbnail,
  metaLine,
  footer
}) {
  const header = user
    ? `${titleCase(eyebrow)} for ${cleanMusicText(user, 80)}`
    : titleCase(eyebrow);

  const body = [
    headerLine(header, emoji, client),
    titleLine(title),
    artistLine(artist, album),
    smallLine(metaLine),
    smallLine(footer)
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder();
  sectionOrText(container, body, thumbnail);

  const row = musicButtons(url, null, client);
  if (row) container.addSeparatorComponents(separator()).addActionRowComponents(row);

  return payload([container]);
}

function actionCard({
  action = 'Music',
  emoji = null,
  client = null,
  track = null,
  detail = '',
  thumbnail = null,
  footer = null,
  url = null
}) {
  const trackTitle = track?.title || track?.name || null;
  const trackUrl = track?.url || url || null;
  const artist = track?.artist || track?.author || null;
  const image = thumbnail || track?.thumbnail || track?.image || null;

  const body = [
    headerLine(action, emoji, client),
    titleLine(trackTitle || action),
    artist ? `**${escapeMarkdown(cleanMusicText(artist, 160))}**` : null,
    detail ? cleanMarkdownLine(detail, 1200) : null,
    smallLine(footer)
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder();
  sectionOrText(container, body, image);

  const row = musicButtons(trackUrl, null, client);
  if (row) container.addSeparatorComponents(separator()).addActionRowComponents(row);

  return payload([container]);
}

function musicNotice({
  label = 'Music',
  title = '',
  detail = '',
  thumbnail = null,
  url = null,
  status = null,
  emoji = null,
  client = null
}) {
  const body = [
    headerLine(label, emoji, client),
    title ? titleLine(title) : null,
    detail ? cleanMarkdownLine(detail, 1800) : null,
    smallLine(status)
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder();
  sectionOrText(container, body || headerLine('Music', emoji, client), thumbnail);

  const row = linkRow([linkButton(url, 'Open')]);
  if (row) container.addSeparatorComponents(separator()).addActionRowComponents(row);

  return payload([container]);
}

function playlistCard({
  title,
  count = 0,
  thumbnail,
  url,
  footer,
  emoji = 'play',
  client = null
}) {
  const body = [
    headerLine('Playlist added', emoji, client),
    titleLine(title || 'Playlist'),
    `**${Number(count || 0).toLocaleString()}** tracks`,
    smallLine(footer)
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder();
  sectionOrText(container, body, thumbnail);

  const row = linkRow([linkButton(url, 'Open playlist')]);
  if (row) container.addSeparatorComponents(separator()).addActionRowComponents(row);

  return payload([container]);
}

function queueCard({
  current,
  tracks = [],
  total = 0,
  volume = 100,
  loop = 'Off',
  state = 'Ready',
  filters = 'off',
  emoji = 'play',
  client = null
}) {
  const now = current
    ? [
        headerLine('Now playing', emoji, client),
        titleLine(current.title || 'Unknown track'),
        artistLine(current.author, current.source),
        smallLine(current.duration)
      ].filter(Boolean).join('\n')
    : [
        headerLine('Queue', emoji, client),
        titleLine('Nothing playing')
      ].join('\n');

  const queueLines = tracks.length
    ? tracks.slice(0, 15).map((track) => {
        const label = cleanMusicText(track.title || 'Unknown track', 70);
        const duration = cleanMusicText(track.duration || 'Unknown', 24);
        return `\`${String(track.index).padStart(2, '0')}\` ${escapeMarkdown(label)} \`${escapeMarkdown(duration)}\``;
      }).join('\n')
    : 'Nothing else queued.';

  const footer = meta([
    `${Number(total || 0).toLocaleString()} waiting`,
    `${volume || 100}%`,
    `Loop ${loop || 'Off'}`,
    state,
    `Filters ${filters || 'off'}`
  ]);

  const container = new ContainerBuilder();
  sectionOrText(container, now, current?.thumbnail);

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(`### Up next\n${queueLines}`),
      text(smallLine(footer) || '\u200B')
    );

  const row = musicButtons(current?.url, null, client);
  if (row) container.addActionRowComponents(row);

  return payload([container]);
}

function searchCard({
  query,
  tracks = [],
  source = 'Music search',
  emoji = 'play',
  client = null
}) {
  const lines = tracks.length
    ? tracks.slice(0, 10).map((track, index) => {
        const label = cleanMusicText(track.title || 'Unknown track', 70);
        const author = track.author ? ` — ${cleanMusicText(track.author, 40)}` : '';
        const duration = cleanMusicText(track.duration || 'Unknown', 24);
        return `\`${index + 1}\` ${escapeMarkdown(label)}${escapeMarkdown(author)} \`${escapeMarkdown(duration)}\``;
      }).join('\n')
    : 'No results found.';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`${headerLine(source, emoji, client)}\n${titleLine(query || 'Search results')}`),
      text(lines)
    );

  return payload([container]);
}

function lastfmNowPlaying({ username, track, client = null }) {
  return trackCard({
    eyebrow: track.nowPlaying ? 'Now playing' : 'Last played',
    emoji: track.nowPlaying ? 'play' : 'backward',
    client,
    user: username,
    title: track.name,
    artist: track.artist,
    album: track.album,
    url: track.url,
    thumbnail: track.image,
    metaLine: track.nowPlaying ? 'currently scrobbling' : 'recent scrobble',
    footer: meta([
      track.album,
      track.userplaycount ? `${track.userplaycount} track scrobbles` : null,
      track.playedAt
    ])
  });
}

function spotifyNowPlaying({
  memberName,
  accountName,
  item,
  isPlaying = false,
  recent = false,
  client = null
}) {
  const artists = (item.artists || []).map((artist) => artist.name).join(', ') || 'Unknown artist';
  const album = item.album?.name || null;
  const image = item.album?.images?.[0]?.url || item.images?.[0]?.url || null;
  const url = item.external_urls?.spotify || item.href || null;

  return trackCard({
    eyebrow: isPlaying ? 'Now playing on Spotify' : recent ? 'Recently played on Spotify' : 'Last Spotify track',
    emoji: isPlaying ? 'play' : 'backward',
    client,
    user: accountName || memberName,
    title: item.name,
    artist: artists,
    album,
    url,
    thumbnail: image,
    metaLine: item.explicit ? 'explicit' : null,
    footer: memberName ? `requested profile: ${memberName}` : null
  });
}

function spotifyEntity({
  type,
  item,
  description,
  thumbnail,
  emoji = 'play',
  client = null
}) {
  const url = item.external_urls?.spotify || item.href || null;
  const image = thumbnail || item.images?.[0]?.url || item.album?.images?.[0]?.url || null;

  const body = [
    headerLine(`Spotify ${type}`, emoji, client),
    titleLine(item.name || 'Spotify result'),
    description ? cleanMarkdownLine(description, 1200) : null
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder();
  sectionOrText(container, body, image);

  const row = linkRow([linkButton(url, 'Open on Spotify')]);
  if (row) container.addSeparatorComponents(separator()).addActionRowComponents(row);

  return payload([container]);
}

module.exports = {
  MUSIC_EMOJIS,
  emojiText,
  emojiObject,
  actionCard,
  musicNotice,
  playlistCard,
  queueCard,
  searchCard,
  trackCard,
  lastfmNowPlaying,
  spotifyNowPlaying,
  spotifyEntity
};