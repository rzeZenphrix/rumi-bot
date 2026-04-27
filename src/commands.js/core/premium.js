const respond = require('../../utils/respond');
const { getPremiumStatus } = require('../../systems/monetization/service');

function describePlans(plans = []) {
  if (!plans.length) return 'None';
  return plans.map((plan) => `- **${plan.name}** (\`${plan.planId}\`)`).join('\n');
}

function describePerks(perks = []) {
  if (!perks.length) return 'No premium perks are active.';
  return perks
    .slice(0, 16)
    .map((perk) => `- ${perk.label}${perk.live ? '' : ' _(coming soon)_'} `)
    .join('\n');
}

module.exports = {
  name: 'premium',
  aliases: ['prem'],
  category: 'core',
  description: 'Show premium status and live perk availability.',
  usage: 'premium [status|features]',
  examples: ['premium', 'premium status', 'premium features'],
  subcommands: [
    {
      name: 'status',
      aliases: ['state'],
      description: 'Show active user and server premium plans.',
      usage: 'premium status',
      examples: ['premium status']
    },
    {
      name: 'features',
      aliases: ['perks'],
      description: 'Show active premium perks for the current context.',
      usage: 'premium features',
      examples: ['premium features']
    }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();
    const status = await getPremiumStatus({
      userId: message.author.id,
      guildId: message.guild?.id || null
    }).catch(() => null);

    if (!status) {
      return respond.reply(message, 'bad', 'I could not load premium status right now because the database is unavailable.');
    }

    if (sub === 'features' || sub === 'perks') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          '**Premium perks**',
          '',
          describePerks(status.activePerks)
        ].join('\n')
      });
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        '**Premium status**',
        '',
        `**User plans**\n${describePlans(status.activePlans.filter((plan) => plan.scope === 'user' || plan.scope === 'vote'))}`,
        '',
        `**Server plans**\n${describePlans(status.activePlans.filter((plan) => plan.scope === 'server'))}`
      ].join('\n')
    });
  }
};
