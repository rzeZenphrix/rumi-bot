const respond = require('../../utils/respond');
const { getPremiumAccessForMessage, requireUserPremium } = require('../../systems/monetization/access');
const { getProfile, updateProfile } = require('../../systems/social/store');
const {
  renderBioCard,
  attachment,
  hasCanvas
} = require('../../utils/socialCanvas');

async function sendBioCard(message, profile, status = 'view') {
  const buffer = await renderBioCard(message.author, profile, status).catch(() => null);
  const file = attachment(buffer, 'rumi-bio.png');

  if (!file) {
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Bio',
      allowTitle: true,
      description: [
        profile.bio ? `**Your bio**\n${profile.bio}` : 'You have not set a bio yet.',
        '',
        `**Leaderboard visibility:** \`${profile.hideLeaderboard ? 'hidden' : 'visible'}\``,
        '',
        hasCanvas() ? '' : '`Install @napi-rs/canvas to enable premium profile cards.`'
      ].filter(Boolean).join('\n')
    });
  }

  return message.channel.send({
    files: [file],
    allowedMentions: { parse: [] }
  });
}

module.exports = {
  name: 'bio',
  aliases: ['aboutme'],
  category: 'social',
  description: 'Set, view, or clear your premium profile bio card.',
  usage: 'bio <view|set|clear|leaderboard> [text]',
  examples: [
    'bio view',
    'bio set Building cool things with Rumi.',
    'bio clear',
    'bio leaderboard hide'
  ],
  slash: true,
  subcommands: [
    {
      name: 'view',
      description: 'Show your saved bio as a premium card.',
      usage: 'bio view',
      examples: ['bio view']
    },
    {
      name: 'set',
      description: 'Set your saved bio text.',
      usage: 'bio set <text>',
      examples: ['bio set hello there']
    },
    {
      name: 'clear',
      description: 'Clear your saved bio text.',
      usage: 'bio clear',
      examples: ['bio clear']
    },
    {
      name: 'leaderboard',
      aliases: ['mask'],
      description: 'View or change your leaderboard visibility.',
      usage: 'bio leaderboard <hide|show|view>',
      examples: ['bio leaderboard hide', 'bio leaderboard show', 'bio leaderboard view'],
      premium: { scope: 'user', tier: 'base' }
    }
  ],

  async execute({ message, args, prefix }) {
    const sub = String(args.shift() || 'view').toLowerCase();
    const commandPrefix = prefix || message.prefix || ',';

    if (sub === 'view') {
      const profile = await getProfile(message.author.id);
      return sendBioCard(message, profile, 'view');
    }

    if (sub === 'leaderboard' || sub === 'mask') {
      const action = String(args.shift() || 'view').toLowerCase();
      const profile = await getProfile(message.author.id);

      if (action === 'view') {
        return respond.reply(
          message,
          'info',
          `Your leaderboard visibility is currently **${profile.hideLeaderboard ? 'hidden' : 'visible'}**.`,
          { mentionUser: false }
        );
      }

      if (!['hide', 'show'].includes(action)) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}bio leaderboard <hide|show|view>\`.`, {
          mentionUser: false
        });
      }

      const access = await getPremiumAccessForMessage(message).catch(() => null);

      if (action === 'hide' && !access?.hasUserPremium) {
        const allowed = await requireUserPremium(message, 'Leaderboard masking', access).catch(() => null);
        if (!allowed) return null;
      }

      const updated = await updateProfile(message.author.id, (next) => {
        next.hideLeaderboard = action === 'hide';
        return next;
      });

      await respond.reply(
        message,
        'good',
        `Your leaderboard visibility is now **${action === 'hide' ? 'hidden' : 'visible'}**.`,
        { mentionUser: false }
      );

      return sendBioCard(message, updated, 'view');
    }

    if (sub === 'clear') {
      const updated = await updateProfile(message.author.id, (profile) => {
        profile.bio = '';
        return profile;
      });

      await respond.reply(message, 'good', 'Cleared your bio.', { mentionUser: false });
      return sendBioCard(message, updated, 'cleared');
    }

    if (sub === 'set') {
      const text = args.join(' ').trim();

      if (!text) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}bio set <text>\`.`, {
          mentionUser: false
        });
      }

      const updated = await updateProfile(message.author.id, (profile) => {
        profile.bio = text.slice(0, 240);
        return profile;
      });

      await respond.reply(message, 'good', 'Updated your bio.', { mentionUser: false });
      return sendBioCard(message, updated, 'updated');
    }

    return respond.reply(
      message,
      'info',
      `Use \`${commandPrefix}bio set <text>\`, \`${commandPrefix}bio view\`, \`${commandPrefix}bio clear\`, or \`${commandPrefix}bio leaderboard <hide|show|view>\`.`,
      { mentionUser: false }
    );
  }
};