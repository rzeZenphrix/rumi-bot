const PAYMENT_METHODS = Object.freeze(['stripe', 'paypal']);

const PERKS = Object.freeze([
  {
    id: 'vote_priority',
    label: 'Vote recognition',
    description: 'Vote status is recognised across Rumi, with a 12-hour earning boost unless a Tier 1+ premium server disables it.',
    filters: { voteTier: 'voter' },
    live: true,
    scope: 'vote',
    commandRefs: ['vote', 'premium']
  },
  {
    id: 'selfprefix',
    label: 'Self prefix',
    description: 'Choose a personal prefix for your own command flow.',
    filters: { userPremium: 'base', serverPremium: 'base' },
    live: true,
    scope: 'shared',
    commandRefs: ['selfprefix', 'prefix']
  },
  {
    id: 'ai_queries_user',
    label: '75 AI queries per day',
    description: 'Raises the free 15-query daily AI allowance to 75 on your account.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['ask']
  },
  {
    id: 'ai_queries_server',
    label: '150 server AI queries per user',
    description: 'Gives every member in the premium server an extra 150 AI queries per day. This stacks with user premium.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['ask']
  },
  {
    id: 'spotify_suite',
    label: 'All Spotify features',
    description: 'Spotify account linking, playback-related features, and premium Spotify commands.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['spotify', 'music']
  },
  {
    id: 'leaderboard_masking',
    label: 'Mask leaderboard presence',
    description: 'Hide your profile from supported leaderboards.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['bio', 'leaderboard', 'economytop']
  },
  {
    id: 'bookmarks_unlimited',
    label: 'Unlimited bookmark tabs',
    description: 'Removes the free 75-bookmark limit.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['bookmark']
  },
  {
    id: 'calendars_unlimited',
    label: 'Unlimited calendars',
    description: 'Removes the free 75-calendar limit.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['calendar']
  },
  {
    id: 'savegif_gallery',
    label: 'Unlimited savegif slots',
    description: 'Save and reuse as many GIF slots as you want, subject to server moderation rules.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['savegif']
  },
  {
    id: 'dm_market_alerts',
    label: 'DM crypto and currency alerts',
    description: 'Subscribe to daily crypto and currency notifications in DMs.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['crypto', 'currency']
  },
  {
    id: 'iplookup_access',
    label: 'IP lookup',
    description: 'Use the IP lookup utility.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['iplookup']
  },
  {
    id: 'linkpreview_access',
    label: 'Link preview',
    description: 'Use Rumi link preview tools.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['linkpreview']
  },
  {
    id: 'reminders_access',
    label: 'Reminders',
    description: 'Create personal reminders with premium limits removed.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['reminder']
  },
  {
    id: 'premium_regex_builder',
    label: 'Regex builder',
    description: 'Use the regex builder with premium access.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['regex']
  },
  {
    id: 'custom_commands_200',
    label: '200 custom commands',
    description: 'Raises the free server limit from 30 custom commands to 200.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['customcommand']
  },
  {
    id: 'bot_bio_ad_removal',
    label: 'Remove support ad link',
    description: 'Premium servers can hide the default support link at the bottom of the bot bio.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['botcustom', 'branding']
  },
  {
    id: 'custom_economy_cooldowns',
    label: 'Custom economy cooldowns',
    description: 'Tune server economy cooldowns, with a hard minimum of 3 seconds.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['economy']
  },
  {
    id: 'ticket_panels_unlimited',
    label: 'Unlimited ticket panels and types',
    description: 'Removes the free panel and ticket-type cap for the server.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['ticket']
  },
  {
    id: 'join_roles_premium',
    label: 'Unlimited join roles',
    description: 'Raises the free join-role cap from 15 to unlimited.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['role']
  },
  {
    id: 'role_connections_premium',
    label: 'Unlimited role connections',
    description: 'Removes the free parent-role and child-link caps on role connections.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['role']
  },
  {
    id: 'voter_boost_toggle',
    label: 'Disable voter earn boosts',
    description: 'Tier 1+ servers can disable the 12-hour vote earning boost.',
    filters: { serverPremium: 'tier1' },
    live: true,
    scope: 'server',
    commandRefs: ['economy']
  }
]);

const CATALOG = Object.freeze([
  {
    planId: 'free',
    name: 'Free',
    scope: 'global',
    tier: 'free',
    billing: [],
    price: '$0',
    paymentMethods: [],
    live: true,
    description: 'Everything stays free unless Rumi specifically marks it as premium.',
    perks: []
  },
  {
    planId: 'voter',
    name: 'Voter',
    scope: 'vote',
    tier: 'voter',
    billing: [],
    price: '$0',
    paymentMethods: [],
    live: true,
    description: 'Vote-based recognition with a 12-hour server-rate earning boost.',
    perks: ['vote_priority']
  },
  {
    planId: 'user_premium_base',
    name: 'User Premium',
    scope: 'user',
    tier: 'base',
    billing: [
      { cycle: 'monthly', price: '$1.50', amountCents: 150 },
      { cycle: 'lifetime', price: '$3.99', amountCents: 399 }
    ],
    price: '$1.50 / month or $3.99 lifetime',
    paymentMethods: PAYMENT_METHODS,
    live: true,
    recommended: true,
    description: 'Premium that follows the Discord user account across DMs and every server you use.',
    perks: [
      'selfprefix',
      'ai_queries_user',
      'spotify_suite',
      'leaderboard_masking',
      'bookmarks_unlimited',
      'calendars_unlimited',
      'savegif_gallery',
      'dm_market_alerts',
      'iplookup_access',
      'linkpreview_access',
      'reminders_access',
      'premium_regex_builder'
    ]
  },
  {
    planId: 'server_premium_base',
    name: 'Server Premium',
    scope: 'server',
    tier: 'base',
    billing: [
      { cycle: 'monthly', price: '$7.00', amountCents: 700 },
      { cycle: 'lifetime', price: '$14.99', amountCents: 1499 }
    ],
    price: '$7.00 / month or $14.99 lifetime',
    paymentMethods: PAYMENT_METHODS,
    live: true,
    description: 'Premium upgrades that apply only inside one server.',
    perks: [
      'ai_queries_server',
      'custom_commands_200',
      'bot_bio_ad_removal',
      'custom_economy_cooldowns',
      'selfprefix',
      'ticket_panels_unlimited',
      'join_roles_premium',
      'role_connections_premium'
    ]
  },
  {
    planId: 'server_premium_tier1',
    name: 'Server Premium Tier 1',
    scope: 'server',
    tier: 'tier1',
    derivedFrom: 'server_premium_base',
    durationMonths: 3,
    billing: [],
    price: 'Derived from 3 months of server premium',
    paymentMethods: [],
    live: true,
    description: 'Unlocked automatically from three months of active server premium.',
    perks: ['voter_boost_toggle']
  },
  {
    planId: 'server_premium_tier2',
    name: 'Server Premium Tier 2',
    scope: 'server',
    tier: 'tier2',
    derivedFrom: 'server_premium_base',
    durationMonths: 6,
    billing: [],
    price: 'Derived from 6 months of server premium',
    paymentMethods: [],
    live: true,
    description: 'Unlocked automatically from six months of active server premium.',
    perks: ['voter_boost_toggle']
  },
  {
    planId: 'server_premium_tier3',
    name: 'Server Premium Tier 3',
    scope: 'server',
    tier: 'tier3',
    derivedFrom: 'server_premium_base',
    durationMonths: 12,
    billing: [],
    price: 'Derived from 12 months of server premium',
    paymentMethods: [],
    live: true,
    description: 'Unlocked automatically from twelve months of active server premium.',
    perks: ['voter_boost_toggle']
  }
]);

function getPerk(id) {
  return PERKS.find((perk) => perk.id === id) || null;
}

function expandPlan(plan) {
  return {
    ...plan,
    perks: plan.perks.map((id) => getPerk(id)).filter(Boolean)
  };
}

function getPremiumCatalog() {
  return {
    updatedAt: new Date().toISOString(),
    paymentMethods: PAYMENT_METHODS,
    filters: {
      voteTier: ['voter'],
      userPremium: ['base'],
      serverPremium: ['base', 'tier1', 'tier2', 'tier3']
    },
    plans: CATALOG.map(expandPlan),
    perks: PERKS
  };
}

function mapPlanToLegacyTier(planId) {
  if (planId === 'free') return 'free';
  if (planId === 'voter') return 'voter';
  if (planId === 'user_premium_base') return 'premium_plus';
  return 'premium';
}

module.exports = {
  PAYMENT_METHODS,
  getPremiumCatalog,
  getPerk,
  mapPlanToLegacyTier
};
