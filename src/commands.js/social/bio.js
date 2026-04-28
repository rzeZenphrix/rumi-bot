const respond = require('../../utils/respond');
const { getPremiumAccessForMessage, requireUserPremium } = require('../../systems/monetization/access');
const { getProfile, updateProfile } = require('../../systems/social/store');

module.exports = {
  name: 'bio',
  aliases: ['aboutme'],
  category: 'social',
  description: 'Set or view profile bio.',
  usage: 'bio <set|view|clear|leaderboard> [text]',
  examples: ['bio view', 'bio set hello there', 'bio leaderboard hide'],
  subcommands: [
    { name: 'view', description: 'Show your saved bio and leaderboard visibility.', usage: 'bio view', examples: ['bio view'] },
    { name: 'set', description: 'Set your saved bio text.', usage: 'bio set <text>', examples: ['bio set hello there'] },
    { name: 'clear', description: 'Clear your saved bio text.', usage: 'bio clear', examples: ['bio clear'] },
    {
      name: 'leaderboard',
      aliases: ['mask'],
      description: 'View or change your leaderboard visibility.',
      usage: 'bio leaderboard <hide|show|view>',
      examples: ['bio leaderboard hide', 'bio leaderboard show'],
      premium: { scope: 'user', tier: 'base' }
    }
  ],

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
        const allowed = await requireUserPremium(message, 'Leaderboard masking', access).catch(() => null);
        if (!allowed) return null;
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
