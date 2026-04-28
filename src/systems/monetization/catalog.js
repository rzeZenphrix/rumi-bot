const PAYMENT_METHODS = Object.freeze(['stripe', 'paypal']);

const PERKS = Object.freeze([
  {
    id: 'vote_priority',
    label: 'Vote recognition',
    description: 'Voter benefits and vote-tier perks appear across Rumi surfaces.',
    filters: { voteTier: 'voter' },
    live: true,
    scope: 'vote',
    commandRefs: ['vote', 'premium']
  },
  {
    id: 'selfprefix',
    label: 'Self prefix',
    description: 'Choose a personal prefix for your own commands.',
    filters: { userPremium: 'base', serverPremium: 'base' },
    live: true,
    scope: 'shared',
    commandRefs: ['prefix']
  },
  {
    id: 'ai_queries_user',
    label: '15 AI queries per day',
    description: 'Raised AI request allowance for user premium.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['ask']
  },
  {
    id: 'leaderboard_masking',
    label: 'Mask leaderboard presence',
    description: 'Hide your profile from supported leaderboard commands.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['bio', 'leaderboard', 'economytop']
  },
  {
    id: 'bookmarks_20',
    label: '20 bookmark tabs',
    description: 'Expanded bookmark capacity over the free tier.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['bookmark']
  },
  {
    id: 'calendars_unlimited',
    label: 'Unlimited calendars',
    description: 'Remove the free-tier calendar limit.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['calendar']
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
    description: 'Use Rumi link preview utilities.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['linkpreview']
  },
  {
    id: 'reminders_access',
    label: 'Reminders',
    description: 'Use reminder scheduling features.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['reminder']
  },
  {
    id: 'music_suite',
    label: 'Music and Spotify features',
    description: 'Music playback, syncing, and Spotify controls.',
    filters: { userPremium: 'base', serverPremium: 'base' },
    live: false,
    comingSoon: true,
    scope: 'shared',
    commandRefs: ['music', 'spotify']
  },
  {
    id: 'savegif_gallery',
    label: 'Save GIF gallery',
    description: 'Store personal GIF slots with moderation controls.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['savegif']
  },
  {
    id: 'dm_market_alerts',
    label: 'DM market alerts',
    description: 'Crypto and currency notifications in DMs.',
    filters: { userPremium: 'base' },
    live: true,
    scope: 'user',
    commandRefs: ['crypto', 'currency']
  },
  {
    id: 'premium_regex_builder',
    label: 'Regex builder',
    description: 'Use the regex builder in DMs or premium servers.',
    filters: { userPremium: 'base', serverPremium: 'base' },
    live: true,
    scope: 'shared',
    commandRefs: ['regex']
  },
  {
    id: 'custom_commands_20',
    label: '20 custom commands',
    description: 'Raise custom command capacity over the free tier.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['customcommand']
  },
  {
    id: 'custom_economy_cooldowns',
    label: 'Custom economy cooldowns',
    description: 'Tune economy command cooldowns with premium minimums.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['economy']
  },
  {
    id: 'dashboard_hotload',
    label: 'Dashboard hotload',
    description: 'Live dashboard-driven updates for premium servers.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['dashboard']
  },
  {
    id: 'bot_bio_ad_removal',
    label: 'Remove bot bio ad link',
    description: 'Hide the default ad link from the bot bio/profile surface.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['botcustom']
  },
  {
    id: 'history_flag_pardons',
    label: 'History flag pardons',
    description: 'Mark stored flags as resolved inside a premium server.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['history']
  },
  {
    id: 'history_flag_deletion',
    label: 'History flag deletion',
    description: 'Delete stored flag history in Tier 2 premium servers.',
    filters: { serverPremium: 'tier2' },
    live: true,
    scope: 'server',
    commandRefs: ['history']
  },
  {
    id: 'join_roles_premium',
    label: 'Expanded join roles',
    description: 'Premium join-role capacity and automation.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['role']
  },
  {
    id: 'role_connections_premium',
    label: 'Expanded role connections',
    description: 'More parent roles and connected-role links.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['role']
  },
  {
    id: 'ai_queries_server',
    label: '30 AI queries per user',
    description: 'Raised per-user AI limits for premium servers.',
    filters: { serverPremium: 'base' },
    live: true,
    scope: 'server',
    commandRefs: ['ask']
  },
  {
    id: 'voter_boost_toggle',
    label: 'Toggle voter earn boosts',
    description: 'Tier 1 or higher servers can disable voter economy boosts.',
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
    description: 'Core Rumi features with free-tier limits.',
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
    description: 'Vote-based perks and recognition.',
    perks: ['vote_priority']
  },
  {
    planId: 'user_premium_base',
    name: 'User Premium',
    scope: 'user',
    tier: 'base',
    billing: [
      { cycle: 'monthly', price: '$2.99', amountCents: 299 },
      { cycle: 'lifetime', price: '$10.99', amountCents: 1099 }
    ],
    price: '$2.99 / month or $10.99 lifetime',
    paymentMethods: PAYMENT_METHODS,
    live: true,
    recommended: true,
    description: 'Premium features that follow your Discord account.',
    perks: [
      'selfprefix',
      'ai_queries_user',
      'leaderboard_masking',
      'bookmarks_20',
      'calendars_unlimited',
      'music_suite',
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
      { cycle: 'monthly', price: '$8.99', amountCents: 899 },
      { cycle: 'lifetime', price: '$25.99', amountCents: 2599 }
    ],
    price: '$8.99 / month or $25.99 lifetime',
    paymentMethods: PAYMENT_METHODS,
    live: true,
    description: 'Premium upgrades that apply to one server.',
    perks: [
      'ai_queries_server',
      'custom_commands_20',
      'bot_bio_ad_removal',
      'custom_economy_cooldowns',
      'selfprefix',
      'history_flag_pardons',
      'dashboard_hotload',
      'premium_regex_builder',
      'join_roles_premium',
      'role_connections_premium',
      'music_suite'
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
    paymentMethods: PAYMENT_METHODS,
    live: true,
    description: 'Three-month derived server premium tier.',
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
    paymentMethods: PAYMENT_METHODS,
    live: true,
    description: 'Six-month derived server premium tier.',
    perks: ['voter_boost_toggle', 'history_flag_deletion']
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
    paymentMethods: PAYMENT_METHODS,
    live: true,
    description: 'Twelve-month derived server premium tier.',
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
