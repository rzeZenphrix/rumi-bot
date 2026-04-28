const respond = require('../../utils/respond');
const { isBotOwner } = require('../../systems/owner/ownerManager');
const {
  getPremiumStatus,
  listAllEntitlements,
  grantEntitlement,
  revokeEntitlement,
  redeemCode,
  repairPremiumOrder
} = require('../../systems/monetization/service');

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function formatEntitlements(rows = []) {
  if (!rows.length) return 'No stored entitlements.';
  return rows.map((row) => {
    const end = row.ends_at ? ` -> ${row.ends_at}` : '';
    return `- **${row.plan_id}** (${row.tier || 'base'}) | ${row.status}${end}`;
  }).join('\n');
}

module.exports = {
  name: 'userpremium',
  aliases: ['upremium', 'userprem'],
  category: 'core',
  description: 'Manage user premium status and redemption.',
  usage: 'userpremium <status|redeem> [code]',
  examples: ['userpremium status', 'userpremium redeem ABCD-1234'],
  slash: { supported: true },
  subcommands: [
    {
      name: 'status',
      aliases: ['state'],
      description: 'Show active user premium plans.',
      usage: 'userpremium status',
      examples: ['userpremium status'],
      slash: { supported: true }
    },
    {
      name: 'redeem',
      aliases: ['claim'],
      description: 'Redeem a user premium code.',
      usage: 'userpremium redeem <premium-code>',
      examples: ['userpremium redeem ABCD-1234'],
      slash: { supported: true }
    },
    {
      name: 'lookup',
      description: 'Owner-only lookup for a user premium scope.',
      usage: 'userpremium lookup <user-id>',
      examples: ['userpremium lookup 123456789012345678'],
      slash: { supported: true }
    },
    {
      name: 'grant',
      description: 'Owner-only manual grant for user premium.',
      usage: 'userpremium grant <user-id> [monthly|lifetime]',
      examples: ['userpremium grant 123456789012345678 lifetime'],
      slash: { supported: true }
    },
    {
      name: 'revoke',
      description: 'Owner-only manual revoke for user premium.',
      usage: 'userpremium revoke <user-id>',
      examples: ['userpremium revoke 123456789012345678'],
      slash: { supported: true }
    },
    {
      name: 'repair',
      description: 'Owner-only repair for a paid user premium order or support code.',
      usage: 'userpremium repair <order-id|receipt-code|support-code> <user-id>',
      examples: ['userpremium repair RPREM-ABCD1234EF56 123456789012345678'],
      slash: { supported: true }
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

    if (['lookup', 'grant', 'revoke', 'repair'].includes(sub) && !isBotOwner(message.author.id)) {
      return respond.reply(message, 'bad', 'That user premium admin action is restricted to bot owners.');
    }

    if (sub === 'lookup') {
      const targetId = String(args.shift() || message.author.id).trim();
      const status = await getPremiumStatus({ userId: targetId }).catch(() => null);
      const rows = await listAllEntitlements('user', targetId).catch(() => []);
      if (!status) {
        return respond.reply(message, 'bad', 'I could not load that user premium scope right now.');
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          `**User premium lookup**`,
          `User ID: \`${targetId}\``,
          '',
          formatEntitlements(rows),
          '',
          `Active plans: ${status.activePlans.length ? status.activePlans.map((plan) => `\`${plan.planId}\``).join(', ') : 'none'}`
        ].join('\n')
      });
    }

    if (sub === 'grant') {
      const targetId = String(args.shift() || '').trim();
      const billingCycle = String(args.shift() || 'lifetime').trim().toLowerCase();
      if (!/^\d{17,20}$/.test(targetId) || !['monthly', 'lifetime'].includes(billingCycle)) {
        return respond.reply(message, 'info', 'Use `userpremium grant <user-id> [monthly|lifetime]`.');
      }

      await grantEntitlement({
        scopeType: 'user',
        scopeId: targetId,
        planId: 'user_premium_base',
        billingCycle,
        endsAt: billingCycle === 'monthly' ? addDays(30) : null,
        metadata: {
          grantedBy: message.author.id,
          source: 'userpremium command'
        }
      });

      return respond.reply(message, 'good', `Granted **user_premium_base** (${billingCycle}) to \`${targetId}\`.`);
    }

    if (sub === 'revoke') {
      const targetId = String(args.shift() || '').trim();
      if (!/^\d{17,20}$/.test(targetId)) {
        return respond.reply(message, 'info', 'Use `userpremium revoke <user-id>`.');
      }

      try {
        await revokeEntitlement({
          scopeType: 'user',
          scopeId: targetId,
          planId: 'user_premium_base',
          reason: 'revoked from userpremium command',
          revokedBy: message.author.id
        });
        return respond.reply(message, 'good', `Revoked **user_premium_base** from \`${targetId}\`.`);
      } catch (error) {
        return respond.reply(message, 'bad', error?.message || 'I could not revoke that entitlement.');
      }
    }

    if (sub === 'repair') {
      const reference = String(args.shift() || '').trim();
      const targetId = String(args.shift() || '').trim();
      if (!reference || !/^\d{17,20}$/.test(targetId)) {
        return respond.reply(message, 'info', 'Use `userpremium repair <order-id|receipt-code|support-code> <user-id>`.');
      }

      try {
        const repaired = await repairPremiumOrder(reference, 'user', targetId, message.author.id);
        return respond.reply(message, 'good', `Repaired **${repaired.entitlement.plan_id}** for \`${targetId}\` from order \`${repaired.order.id}\`.`);
      } catch (error) {
        return respond.reply(message, 'bad', error?.message || 'I could not repair that user premium order.');
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
