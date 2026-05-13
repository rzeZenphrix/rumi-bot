const respond = require('../../utils/respond');
const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'joins',
  aliases: ['joinstats', 'memberjoins'],
  category: 'invites',
  description: 'Show server join stats by period.',
  usage: 'joins [daily|weekly|monthly|alltime]',
  examples: ['joins daily', 'joins weekly', 'joins monthly', 'joins alltime'],
  guildOnly: true,

  async execute({ message, args }) {
    const period = inviteTracker.normalizePeriod(args[0] || 'daily');
    const stats = await inviteTracker.getJoinStats(message.guild.id, period);

    return respond.reply(
      message,
      'info',
      [
        `Join stats — **${period}**`,
        `Total joins: **${stats?.total || 0}**`,
        `Invite joins: **${stats?.invite_joins || 0}**`,
        `Vanity joins: **${stats?.vanity_joins || 0}**`,
        `Unknown joins: **${stats?.unknown_joins || 0}**`,
        `Active: **${stats?.active || 0}**`,
        `Left: **${stats?.left_count || 0}**`
      ].join('\n'),
      { allowedMentions: { parse: [] } }
    );
  }
};