const DIRECT_MUSIC_COMMANDS = [
  ['play', 'Play a song, playlist, or search result in your current voice channel.', 'play <query>', ['play pink pony club']],
  ['search', 'Search for tracks without starting playback immediately.', 'search <query>', ['search keshi limbo']],
  ['queue', 'Show the active queue for this server.', 'queue', ['queue']],
  ['nowplaying', 'Show the track currently playing.', 'nowplaying', ['nowplaying']],
  ['skip', 'Skip the current track.', 'skip', ['skip']],
  ['pause', 'Pause playback.', 'pause', ['pause']],
  ['resume', 'Resume playback.', 'resume', ['resume']],
  ['stop', 'Stop playback and clear the queue.', 'stop', ['stop']],
  ['leave', 'Disconnect Rumi from the voice channel.', 'leave', ['leave']],
  ['volume', 'Set the playback volume.', 'volume <value>', ['volume 80']],
  ['seek', 'Jump to a time inside the current track.', 'seek <position>', ['seek 1:45']],
  ['loop', 'Toggle loop mode for the queue or current track.', 'loop <off|track|queue>', ['loop track']],
  ['shuffle', 'Shuffle the queue.', 'shuffle', ['shuffle']],
  ['remove', 'Remove one track from the queue.', 'remove <index>', ['remove 4']],
  ['move', 'Move a track to another queue position.', 'move <from> <to>', ['move 5 2']],
  ['clear', 'Clear every queued track.', 'clear', ['clear']],
  ['history', 'Show recently played tracks.', 'history', ['history']],
  ['stats', 'Show node, queue, and playback stats.', 'stats', ['stats']],
  ['lyrics', 'Show lyrics for the current track when available.', 'lyrics', ['lyrics']],
  ['autoplay', 'Turn autoplay on or off.', 'autoplay <on|off>', ['autoplay on']],
  ['filter', 'Apply a playback filter or clear the current one.', 'filter <mode>', ['filter vaporwave']],
  ['panel', 'Post the interactive music control panel.', 'panel', ['panel']],
  ['export', 'Export the current queue into a reusable code.', 'export', ['export']],
  ['import', 'Import a queue from an export code.', 'import <code>', ['import abc123']],
  ['settings', 'View or change music settings for this server.', 'settings [option] [value]', ['settings volume 80']],
];

const DIRECT_MUSIC_MAP = new Map(
  DIRECT_MUSIC_COMMANDS.map(([name, description, usage, examples]) => [
    name,
    { name, description, usage, examples },
  ]),
);

function isDirectMusicCommand(name) {
  return DIRECT_MUSIC_MAP.has(String(name || '').toLowerCase());
}

function buildMusicAliasEntries(prefix) {
  return [...DIRECT_MUSIC_MAP.values()].map((entry) => ({
    id: `music-alias:${entry.name}`,
    parent: 'music',
    type: 'command',
    name: entry.name,
    fullName: entry.name,
    prefix,
    aliases: [],
    category: 'music',
    module: 'music',
    description: entry.description,
    usage: entry.usage,
    parameters: entry.usage.includes(' ') ? entry.usage.slice(entry.usage.indexOf(' ') + 1) : 'n/a',
    examples: entry.examples.map((example) => `${prefix}${example}`),
    example: `${prefix}${entry.examples[0]}`,
    permissions: [],
    botPermissions: [],
    flags: [],
    premium: false,
    premiumRequirement: null,
    premiumLabel: null,
    nsfw: false,
    slashSupported: false,
    slashLabel: 'Prefix only',
    information: 'Prefix only • Module music',
    virtual: true,
  }));
}

module.exports = {
  DIRECT_MUSIC_COMMANDS,
  isDirectMusicCommand,
  buildMusicAliasEntries,
};
