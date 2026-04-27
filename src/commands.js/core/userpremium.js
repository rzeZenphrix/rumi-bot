const respond = require('../../utils/respond');
const { getPremiumStatus, redeemCode } = require('../../systems/monetization/service');

module.exports = {
  name: 'userpremium',
  aliases: ['upremium', 'userprem'],
  category: 'core',
  description: 'Manage user premium status and redemption.',
  usage: 'userpremium <status|redeem> [code]',
  examples: ['userpremium status', 'userpremium redeem ABCD-1234'],
  subcommands: [
    {
      name: 'status',
      aliases: ['state'],
      description: 'Show active user premium plans.',
      usage: 'userpremium status',
      examples: ['userpremium status']
    },
    {
      name: 'redeem',
      aliases: ['claim'],
      description: 'Redeem a user premium code.',
      usage: 'userpremium redeem <premium-code>',
      examples: ['userpremium redeem ABCD-1234']
    }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();

    if (sub === 'redeem') {
      const code = String(args.shift() || '').trim();
      if (!code) {
        return respond.reply(message, 'info', 'Use `userpremium redeem <premium-code>`.');
      }

      try {
        const entitlement = await redeemCode(code, 'user', message.author.id, message.author.id);
        return respond.reply(message, 'good', `Redeemed **${entitlement.plan_id}** for your account.`);
      } catch (error) {
        return respond.reply(message, 'bad', error?.message || 'I could not redeem that premium code.');
      }
    }

    const status = await getPremiumStatus({ userId: message.author.id }).catch(() => null);
    if (!status) {
      return respond.reply(message, 'bad', 'I could not load user premium status right now.');
    }

    const plans = status.activePlans.filter((plan) => plan.scope === 'user' || plan.scope === 'vote');
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: plans.length
        ? ['**User premium**', '', ...plans.map((plan) => `- **${plan.name}** (\`${plan.planId}\`)`)].join('\n')
        : '**User premium**\n\nNo active user premium plans.'
    });
  }
};
