const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { isBotOwner } = require('../../systems/owner/ownerManager');
const {
  getCatalog,
  getPremiumStatus,
  listAllEntitlements,
  grantEntitlement,
  revokeEntitlement,
  redeemCode,
  repairPremiumOrder
} = require('../../systems/monetization/service');

const pendingConfirmations = new Map();
const CONFIRM_TTL_MS = 15 * 60 * 1000;

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

function looksLikeInvite(value) {
  const raw = String(value || '').trim();
  return (
    /discord\.gg\/|discord(?:app)?\.com\/invite\//i.test(raw) ||
    /^[A-Za-z0-9-]{2,32}$/.test(raw)
  );
}

function extractInviteCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([A-Za-z0-9-]+)/i);
  if (match?.[1]) return match[1];
  return /^[A-Za-z0-9-]{2,32}$/.test(raw) ? raw : null;
}

function prunePending() {
  const now = Date.now();
  for (const [token, entry] of pendingConfirmations.entries()) {
    if (now - entry.createdAt > CONFIRM_TTL_MS) {
      pendingConfirmations.delete(token);
    }
  }
}

function createConfirmationToken(payload) {
  prunePending();
  const token = crypto.randomBytes(8).toString('hex');
  pendingConfirmations.set(token, {
    ...payload,
    createdAt: Date.now()
  });
  return token;
}

function readConfirmationToken(token) {
  prunePending();
  return pendingConfirmations.get(token) || null;
}

function clearConfirmationToken(token) {
  pendingConfirmations.delete(token);
}

async function resolveGuildFromArg(message, raw) {
  if (!raw) return message.guild;
  if (/^\d{17,20}$/.test(raw)) {
    return message.client.guilds.fetch(raw).catch(() => null);
  }
  if (looksLikeInvite(raw)) {
    const inviteCode = extractInviteCode(raw);
    const invite = await message.client.fetchInvite(inviteCode || raw).catch(() => null);
    return invite?.guild
      ? message.client.guilds.fetch(invite.guild.id).catch(() => null)
      : null;
  }
  return null;
}

function buildConfirmationRow(token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sprem:confirm:${token}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('Confirm Redemption'),
    new ButtonBuilder()
      .setCustomId(`sprem:cancel:${token}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Cancel')
  );
}

function buildConfirmationEmbed(message, guild, plan, code, viaInvite) {
  return respond.makeEmbed('alert', message.author, null, {
    guildId: message.guild?.id,
    allowTitle: true,
    title: 'Confirm Server Premium Redemption',
    mentionUser: false,
    thumbnail: guild.iconURL?.({ size: 256, extension: 'png' }) || null,
    description: [
      `You're about to redeem \`${code}\` for **${guild.name}**.`,
      '',
      `Plan: **${plan?.name || plan?.planId || 'Server Premium'}**`,
      viaInvite ? 'Target server was resolved from the invite you provided.' : 'Target server was resolved directly from the server id/current server.',
      '',
      'Press **Confirm Redemption** to activate the premium code for that server.'
    ].join('\n')
  });
}

function buildResultEmbed(interaction, guild, message, type, title, description) {
  return respond.makeEmbed(type, interaction.user, null, {
    guildId: message.guildId || interaction.guildId,
    allowTitle: true,
    title,
    mentionUser: false,
    thumbnail: guild?.iconURL?.({ size: 256, extension: 'png' }) || null,
    description
  });
}

module.exports = {
  name: 'serverpremium',
  aliases: ['spremium', 'serverprem'],
  category: 'core',
  description: 'Manage server premium status and redemption.',
  usage: 'serverpremium <status|redeem> [code] [server-id|invite]',
  examples: [
    'serverpremium status',
    'serverpremium redeem ABCD-1234',
    'serverpremium redeem ABCD-1234 123456789012345678',
    'serverpremium redeem ABCD-1234 https://discord.gg/example'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: { supported: true },
  subcommands: [
    {
      name: 'status',
      aliases: ['state'],
      description: 'Show active server premium plans for this server.',
      usage: 'serverpremium status',
      examples: ['serverpremium status'],
      slash: { supported: true }
    },
    {
      name: 'redeem',
      aliases: ['claim'],
      description: 'Redeem a server premium code for a server id or invite.',
      usage: 'serverpremium redeem <premium-code> <server-id|invite>',
      examples: [
        'serverpremium redeem ABCD-1234 123456789012345678',
        'serverpremium redeem ABCD-1234 https://discord.gg/example'
      ],
      slash: { supported: true }
    },
    {
      name: 'lookup',
      description: 'Owner-only lookup for server premium entitlements.',
      usage: 'serverpremium lookup <server-id|invite>',
      examples: ['serverpremium lookup 123456789012345678'],
      slash: { supported: true }
    },
    {
      name: 'grant',
      description: 'Owner-only manual grant for server premium.',
      usage: 'serverpremium grant <server-id|invite> [base|tier1|tier2|tier3] [monthly|lifetime]',
      examples: ['serverpremium grant 123456789012345678 tier2 lifetime'],
      slash: { supported: true }
    },
    {
      name: 'revoke',
      description: 'Owner-only manual revoke for server premium.',
      usage: 'serverpremium revoke <server-id|invite> [base|tier1|tier2|tier3]',
      examples: ['serverpremium revoke 123456789012345678 tier2'],
      slash: { supported: true }
    },
    {
      name: 'repair',
      description: 'Owner-only repair for a paid server premium order or support code.',
      usage: 'serverpremium repair <order-id|receipt-code|support-code> <server-id|invite>',
      examples: ['serverpremium repair RPREM-ABCD1234EF56 123456789012345678'],
      slash: { supported: true }
    }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();

    if (sub === 'redeem') {
      const code = String(args.shift() || '').trim().toUpperCase();
      const targetArg = String(args.shift() || '').trim();
      if (!code) {
        return respond.reply(message, 'info', 'Use `serverpremium redeem <premium-code> <server-id|invite>`.');
      }

      const guild = await resolveGuildFromArg(message, targetArg).catch(() => null);
      if (!guild) {
        return respond.reply(message, 'bad', 'I could not resolve that server id or invite. The invite is only used so I can resolve the target server id.');
      }

      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member?.permissions?.has(PermissionFlagsBits.ManageGuild) && message.author.id !== guild.ownerId) {
        return respond.reply(message, 'bad', 'You need Manage Server in the target server to redeem server premium there.');
      }

      const entry = await db.getPremiumRedemptionCode(code).catch(() => null);
      if (!entry) {
        return respond.reply(message, 'bad', 'That premium code is invalid.');
      }
      if (entry.status !== 'ready') {
        return respond.reply(message, 'bad', 'That premium code is no longer available.');
      }

      const catalog = await getCatalog().catch(() => ({ plans: [] }));
      const plan = catalog.plans.find((item) => item.planId === entry.plan_id) || null;
      if (plan?.scope && plan.scope !== 'server') {
        return respond.reply(message, 'bad', 'That code is not a server premium code.');
      }

      const token = createConfirmationToken({
        userId: message.author.id,
        guildId: guild.id,
        code,
        channelId: message.channel.id
      });

      return message.channel.send({
        embeds: [
          buildConfirmationEmbed(message, guild, plan || { planId: entry.plan_id, name: entry.plan_id }, code, looksLikeInvite(targetArg))
        ],
        components: [buildConfirmationRow(token)],
        allowedMentions: { users: [message.author.id], roles: [] }
      });
    }

    if (['lookup', 'grant', 'revoke', 'repair'].includes(sub) && !isBotOwner(message.author.id)) {
      return respond.reply(message, 'bad', 'That server premium admin action is restricted to bot owners.');
    }

    if (sub === 'lookup') {
      const guild = await resolveGuildFromArg(message, String(args.shift() || '').trim()).catch(() => null);
      if (!guild) {
        return respond.reply(message, 'info', 'Use `serverpremium lookup <server-id|invite>`.');
      }

      const status = await getPremiumStatus({ guildId: guild.id }).catch(() => null);
      const rows = await listAllEntitlements('guild', guild.id).catch(() => []);
      if (!status) {
        return respond.reply(message, 'bad', 'I could not load that server premium scope right now.');
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          `**Server premium lookup**`,
          `Guild: **${guild.name}** (\`${guild.id}\`)`,
          '',
          formatEntitlements(rows),
          '',
          `Active plans: ${status.activePlans.length ? status.activePlans.map((plan) => `\`${plan.planId}\``).join(', ') : 'none'}`
        ].join('\n')
      });
    }

    if (sub === 'grant') {
      const guild = await resolveGuildFromArg(message, String(args.shift() || '').trim()).catch(() => null);
      const tier = String(args.shift() || 'base').trim().toLowerCase();
      const billingCycle = String(args.shift() || 'lifetime').trim().toLowerCase();
      if (!guild || !['base', 'tier1', 'tier2', 'tier3'].includes(tier) || !['monthly', 'lifetime'].includes(billingCycle)) {
        return respond.reply(message, 'info', 'Use `serverpremium grant <server-id|invite> [base|tier1|tier2|tier3] [monthly|lifetime]`.');
      }

      const planId = tier === 'base' ? 'server_premium_base' : `server_premium_${tier}`;
      await grantEntitlement({
        scopeType: 'guild',
        scopeId: guild.id,
        planId,
        tier,
        billingCycle,
        endsAt: billingCycle === 'monthly' ? addDays(30) : null,
        metadata: {
          grantedBy: message.author.id,
          source: 'serverpremium command'
        }
      });

      return respond.reply(message, 'good', `Granted **${planId}** (${billingCycle}) to **${guild.name}**.`);
    }

    if (sub === 'revoke') {
      const guild = await resolveGuildFromArg(message, String(args.shift() || '').trim()).catch(() => null);
      const tier = String(args.shift() || 'base').trim().toLowerCase();
      if (!guild || !['base', 'tier1', 'tier2', 'tier3'].includes(tier)) {
        return respond.reply(message, 'info', 'Use `serverpremium revoke <server-id|invite> [base|tier1|tier2|tier3]`.');
      }

      const planId = tier === 'base' ? 'server_premium_base' : `server_premium_${tier}`;
      try {
        await revokeEntitlement({
          scopeType: 'guild',
          scopeId: guild.id,
          planId,
          tier,
          reason: 'revoked from serverpremium command',
          revokedBy: message.author.id
        });
        return respond.reply(message, 'good', `Revoked **${planId}** from **${guild.name}**.`);
      } catch (error) {
        return respond.reply(message, 'bad', error?.message || 'I could not revoke that server premium entitlement.');
      }
    }

    if (sub === 'repair') {
      const reference = String(args.shift() || '').trim();
      const guild = await resolveGuildFromArg(message, String(args.shift() || '').trim()).catch(() => null);
      if (!reference || !guild) {
        return respond.reply(message, 'info', 'Use `serverpremium repair <order-id|receipt-code|support-code> <server-id|invite>`.');
      }

      try {
        const repaired = await repairPremiumOrder(reference, 'guild', guild.id, message.author.id);
        return respond.reply(message, 'good', `Repaired **${repaired.entitlement.plan_id}** for **${guild.name}** from order \`${repaired.order.id}\`.`);
      } catch (error) {
        return respond.reply(message, 'bad', error?.message || 'I could not repair that server premium order.');
      }
    }

    const status = await getPremiumStatus({ guildId: message.guild.id }).catch(() => null);
    if (!status) {
      return respond.reply(message, 'bad', 'I could not load server premium status right now.');
    }

    const plans = status.activePlans.filter((plan) => plan.scope === 'server');
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: plans.length
        ? ['**Server premium**', '', ...plans.map((plan) => `- **${plan.name}** (\`${plan.planId}\`)`)].join('\n')
        : `**Server premium**\n\nNo active premium plans for **${message.guild.name}**.`
    });
  },

  async handleServerPremiumInteraction(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('sprem:')) return false;

    const [, action, token] = interaction.customId.split(':');
    const entry = readConfirmationToken(token);

    if (!entry) {
      await interaction.reply({
        ephemeral: true,
        content: 'That server premium confirmation expired. Run the redeem command again.'
      }).catch(() => null);
      return true;
    }

    if (interaction.user.id !== entry.userId) {
      await interaction.reply({
        ephemeral: true,
        content: 'Only the user who started this redemption can confirm it.'
      }).catch(() => null);
      return true;
    }

    const guild = await interaction.client.guilds.fetch(entry.guildId).catch(() => null);
    if (!guild) {
      clearConfirmationToken(token);
      await interaction.update({
        embeds: [
          buildResultEmbed(
            interaction,
            null,
            interaction.message,
            'bad',
            'Server Premium Redemption',
            'I could not find that target server anymore.'
          )
        ],
        components: []
      }).catch(() => null);
      return true;
    }

    if (action === 'cancel') {
      clearConfirmationToken(token);
      await interaction.update({
        embeds: [
          buildResultEmbed(
            interaction,
            guild,
            interaction.message,
            'info',
            'Server Premium Redemption Cancelled',
            `No premium code was redeemed for **${guild.name}**.`
          )
        ],
        components: []
      }).catch(() => null);
      return true;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions?.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== guild.ownerId) {
      await interaction.reply({
        ephemeral: true,
        content: 'You need Manage Server in the target server to finish this redemption.'
      }).catch(() => null);
      return true;
    }

    try {
      const entitlement = await redeemCode(entry.code, 'guild', guild.id, interaction.user.id);
      clearConfirmationToken(token);
      await interaction.update({
        embeds: [
          buildResultEmbed(
            interaction,
            guild,
            interaction.message,
            'good',
            'Server Premium Redeemed',
            `Redeemed **${entitlement.plan_id}** for **${guild.name}**.`
          )
        ],
        components: []
      });
    } catch (error) {
      clearConfirmationToken(token);
      await interaction.update({
        embeds: [
          buildResultEmbed(
            interaction,
            guild,
            interaction.message,
            'bad',
            'Server Premium Redemption Failed',
            error?.message || 'I could not redeem that premium code.'
          )
        ],
        components: []
      }).catch(() => null);
    }

    return true;
  }
};
