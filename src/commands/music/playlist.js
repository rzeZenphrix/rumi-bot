const respond = require('../../utils/respond');
const {
  MAX_TRACKS,
  normalizeName,
  cleanQuery,
  getUserPlaylists,
  getPlaylist,
  upsertPlaylist,
  deletePlaylist,
  exportPlaylist,
  importPlaylist,
  playQuery,
  recordMusicPlay
} = require('../../systems/music/musicExtras');

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    plain: true,
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

async function queuePlaylist(message, playlist) {
  let queued = 0;

  for (const track of playlist.tracks.slice(0, MAX_TRACKS)) {
    const payload = await playQuery(message, track, 'playlist');
    if (payload?.ok) queued += 1;
  }

  await recordMusicPlay(message.guild.id, message.author.id, {
    type: 'playlist',
    playlist: playlist.name
  }).catch(() => null);

  return queued;
}

module.exports = {
  name: 'playlist',
  aliases: ['pl'],
  category: 'music',
  description: 'Create, save, queue, share, or import personal playlists.',
  usage: 'playlist <list|create|add|remove|show|play|delete|share|import> ...',
  examples: [
    'playlist list',
    'playlist create chill',
    'playlist add chill keshi limbo',
    'playlist play chill',
    'playlist share chill',
    'playlist import <code> chill2'
  ],
  guildOnly: true,
  typing: true,

  async execute({ message, args }) {
    const action = String(args.shift() || 'list').toLowerCase();

    if (action === 'list') {
      const data = await getUserPlaylists(message.guild.id, message.author.id);
      const lists = Object.values(data.playlists || {});

      if (!lists.length) {
        return plain(message, 'info', 'No playlists yet. Use `playlist create <name>`.');
      }

      return plain(message, 'info', lists.map((p) => `${p.name} — ${p.tracks?.length || 0} tracks`).join('\n'));
    }

    if (action === 'create') {
      const name = normalizeName(args.shift());

      if (!name) {
        return plain(message, 'info', 'Usage: `playlist create <name>`.');
      }

      const result = await upsertPlaylist(message.guild.id, message.author.id, name, (playlist) => playlist);

      if (result.error) {
        return plain(message, 'bad', result.error);
      }

      return plain(message, 'good', `Playlist created: ${name}.`);
    }

    if (action === 'add' || action === 'save') {
      const name = normalizeName(args.shift());
      const query = cleanQuery(args.join(' '));

      if (!name || !query) {
        return plain(message, 'info', 'Usage: `playlist add <name> <song or URL>`.');
      }

      const result = await upsertPlaylist(message.guild.id, message.author.id, name, (playlist) => {
        playlist.tracks ||= [];

        if (playlist.tracks.length >= MAX_TRACKS) {
          return { error: `Track limit reached: ${MAX_TRACKS}.` };
        }

        playlist.tracks.push(query);

        return playlist;
      });

      if (result.error) {
        return plain(message, 'bad', result.error);
      }

      return plain(message, 'good', `Added to ${name}: ${query}`);
    }

    if (action === 'remove' || action === 'rm') {
      const name = normalizeName(args.shift());
      const index = Number.parseInt(args.shift(), 10) - 1;

      if (!name || !Number.isInteger(index)) {
        return plain(message, 'info', 'Usage: `playlist remove <name> <index>`.');
      }

      const result = await upsertPlaylist(message.guild.id, message.author.id, name, (playlist) => {
        if (!playlist.tracks?.[index]) {
          return { error: 'That track does not exist.' };
        }

        playlist.tracks.splice(index, 1);

        return playlist;
      });

      if (result.error) {
        return plain(message, 'bad', result.error);
      }

      return plain(message, 'good', `Removed track ${index + 1} from ${name}.`);
    }

    if (action === 'show') {
      const name = normalizeName(args.shift());
      const playlist = await getPlaylist(message.guild.id, message.author.id, name);

      if (!playlist) {
        return plain(message, 'bad', 'Playlist not found.');
      }

      const lines = playlist.tracks.slice(0, 20).map((track, i) => `${i + 1}. ${track}`);

      return plain(message, 'info', `${playlist.name}\n${lines.join('\n') || 'No tracks.'}`);
    }

    if (action === 'play' || action === 'load') {
      const name = normalizeName(args.shift());
      const playlist = await getPlaylist(message.guild.id, message.author.id, name);

      if (!playlist) {
        return plain(message, 'bad', 'Playlist not found.');
      }

      if (!playlist.tracks?.length) {
        return plain(message, 'info', 'That playlist is empty.');
      }

      const queued = await queuePlaylist(message, playlist);

      return plain(
        message,
        queued ? 'good' : 'bad',
        queued ? `Queued ${queued} track(s) from ${playlist.name}.` : 'Could not queue that playlist.'
      );
    }

    if (action === 'delete' || action === 'del') {
      const name = normalizeName(args.shift());

      if (!name) {
        return plain(message, 'info', 'Usage: `playlist delete <name>`.');
      }

      const deleted = await deletePlaylist(message.guild.id, message.author.id, name);

      return plain(message, deleted ? 'good' : 'bad', deleted ? `Deleted ${name}.` : 'Playlist not found.');
    }

    if (action === 'share' || action === 'export') {
      const name = normalizeName(args.shift());
      const playlist = await getPlaylist(message.guild.id, message.author.id, name);

      if (!playlist) {
        return plain(message, 'bad', 'Playlist not found.');
      }

      return plain(message, 'info', `Share code for ${playlist.name}:\n\`${exportPlaylist(playlist)}\``);
    }

    if (action === 'import') {
      const code = args.shift();
      const customName = normalizeName(args.shift());
      const imported = importPlaylist(code);

      if (!imported) {
        return plain(message, 'bad', 'Invalid playlist code.');
      }

      const name = customName || imported.name || 'imported';

      const result = await upsertPlaylist(message.guild.id, message.author.id, name, (playlist) => {
        playlist.tracks = imported.tracks.slice(0, MAX_TRACKS);
        return playlist;
      });

      if (result.error) {
        return plain(message, 'bad', result.error);
      }

      return plain(message, 'good', `Imported ${result.playlist.tracks.length} track(s) into ${name}.`);
    }

    return plain(message, 'info', 'Usage: `playlist <list|create|add|remove|show|play|delete|share|import> ...`.');
  }
};