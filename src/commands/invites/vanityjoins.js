const respond = require('../../utils/respond');
const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'vanityjoins',
  aliases: ['vanity', 'vjoins'],
  category: 'invites',
  description: 'Show vanity invite join stats.',
  usage: 'vanityjoins [daily|weekly|monthly|alltime]',
  examples: ['vanityjoins daily', 'vanityjoins alltime'],
  guildOnly: true,

  async execute({ message, args }) {
    const period = inviteTracker.normalizePeriod(args[0] || 'alltime');
    const stats = await inviteTracker.getVanityStats(message.guild.id, period);

    return respond.reply(
      message,
      'info',
      [
        `Vanity joins — **${period}**`,
        `Total: **${stats?.total || 0}**`,
        `Active: **${stats?.active || 0}**`,
        `Left: **${stats?.left_count || 0}**`
      ].join('\n'),
      { allowedMentions: { parse: [] } }
    );
  }
};