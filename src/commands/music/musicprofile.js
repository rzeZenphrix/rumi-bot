const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { getMusicProfile } = require('../../systems/music/musicExtras');

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    plain: true,
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

module.exports = {
  name: 'musicprofile',
  aliases: ['mprofile', 'listening'],
  category: 'music',
  description: 'Show a user music profile.',
  usage: 'musicprofile [user]',
  examples: ['musicprofile', 'musicprofile @user'],
  guildOnly: true,

  async execute({ message, args }) {
    const userId = extractId(args[0]) || message.author.id;
    const profile = await getMusicProfile(message.guild.id, userId);

    if (!profile) {
      return plain(message, 'info', `<@${userId}> has no music profile yet.`);
    }

    const top = Object.entries(profile.topQueries || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, count], i) => `${i + 1}. ${query} — ${count}`)
      .join('\n') || 'No top tracks yet.';

    return plain(
      message,
      'info',
      [
        `Music profile for <@${userId}>`,
        `Plays: ${profile.plays || 0}`,
        `Radio: ${profile.radioPlays || 0}`,
        `Vibes: ${profile.vibeUses || 0}`,
        `Playlists queued: ${profile.playlistQueues || 0}`,
        `Last: ${profile.lastQuery || 'none'}`,
        '',
        top
      ].join('\n')
    );
  }
};