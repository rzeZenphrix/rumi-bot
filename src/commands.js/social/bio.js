const respond = require('../../utils/respond');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const { getProfile, updateProfile } = require('../../systems/social/store');

module.exports = {
  name: 'bio',
  aliases: ['aboutme'],
  category: 'social',
  description: 'Set or view profile bio.',
  usage: 'bio <set|view|clear|leaderboard> [text]',

  async execute({ message, args }) {
    const sub = (args.shift() || 'view').toLowerCase();

    if (sub === 'view') {
      const profile = await getProfile(message.author.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          profile.bio ? `**Your bio**\n${profile.bio}` : 'You have not set a bio yet.',
          '',
          `**Leaderboard visibility:** \`${profile.hideLeaderboard ? 'hidden' : 'visible'}\``
        ].join('\n')
      });
    }

    if (sub === 'leaderboard' || sub === 'mask') {
      const action = String(args.shift() || 'view').toLowerCase();
      const profile = await getProfile(message.author.id);

      if (action === 'view') {
        return respond.reply(message, 'info', `Your leaderboard visibility is currently **${profile.hideLeaderboard ? 'hidden' : 'visible'}**.`);
      }

      if (!['hide', 'show'].includes(action)) {
        return respond.reply(message, 'info', 'Use `bio leaderboard <hide|show|view>`.');
      }

      const access = await getPremiumAccessForMessage(message).catch(() => null);
      if (action === 'hide' && !access?.hasUserPremium) {
        return respond.reply(message, 'bad', 'Hiding your leaderboard presence needs user premium.');
      }

      await updateProfile(message.author.id, (next) => {
        next.hideLeaderboard = action === 'hide';
        return next;
      });

      return respond.reply(message, 'good', `Your leaderboard visibility is now **${action === 'hide' ? 'hidden' : 'visible'}**.`);
    }

    if (sub === 'clear') {
      await updateProfile(message.author.id, (profile) => {
        profile.bio = '';
        return profile;
      });
      return respond.reply(message, 'good', 'Cleared your bio.');
    }

    if (sub === 'set') {
      const text = args.join(' ').trim();
      if (!text) return respond.reply(message, 'info', 'Use `bio set <text>`.');
      await updateProfile(message.author.id, (profile) => {
        profile.bio = text.slice(0, 240);
        return profile;
      });
      return respond.reply(message, 'good', 'Updated your bio.');
    }

    return respond.reply(message, 'info', 'Use `bio set <text>`, `bio view`, `bio clear`, or `bio leaderboard <hide|show|view>`.');
  }
};
