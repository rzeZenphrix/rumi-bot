const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { createDashboardUrl } = require('../../systems/dashboard/session');
const { requireServerPremium } = require('../../systems/monetization/access');
const { syncDashboardBackend } = require('../../services/dashboardSync');

const FALLBACK_DASHBOARD_URL =
  process.env.DASHBOARD_PUBLIC_URL ||
  process.env.DASHBOARD_URL ||
  'https://rumi.rocks/studio';

module.exports = {
  name: 'dashboard',
  aliases: ['dash', 'panel'],
  category: 'utility',
  description: 'Open the Rumi dashboard for this server.',
  usage: 'dashboard [hotload]',
  examples: ['dashboard', 'dashboard hotload'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  typing: true,
  slash: { supported: true },
  subcommands: [
    {
      name: 'open',
      description: 'Open the public dashboard landing flow for this server.',
      usage: 'dashboard',
      examples: ['dashboard']
    },
    {
      name: 'hotload',
      aliases: ['sync'],
      description: 'Push a fresh runtime sync to the dashboard backend.',
      usage: 'dashboard hotload',
      examples: ['dashboard hotload'],
      premium: { scope: 'server', tier: 'base' },
      slash: { supported: true }
    }
  ],

  async execute({ message, args }) {
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'hotload' || sub === 'sync') {
      const access = await requireServerPremium(message, 'Dashboard hotload').catch(() => null);
      if (!access) return null;

      const synced = await syncDashboardBackend(message.client).catch(() => false);
      return respond.reply(
        message,
        synced ? 'good' : 'bad',
        synced
          ? 'Pushed a fresh command/runtime sync to the dashboard backend.'
          : 'I could not reach the dashboard backend right now.'
      );
    }

    const url = await createDashboardUrl(
      message.author.id,
      message.guild.id,
      ['dashboard', 'guild:manage']
    ).catch((error) => {
      if (error?.message?.includes('DASHBOARD_URL')) return error;
      return null;
    });

    if (!url) {
      return respond.reply(message, 'bad', 'I could not create a dashboard session because the database is currently unreachable.');
    }

    if (url instanceof Error) {
      return respond.reply(message, 'info', null, {
        title: 'Rumi Dashboard',
        description: `I could not mint a signed dashboard session right now.\n\nYou can still open the dashboard directly here:\n${FALLBACK_DASHBOARD_URL}`,
        footer: { text: 'Set DASHBOARD_URL to enable one-click signed links.' }
      });
    }

    return respond.reply(message, 'info', null, {
      title: 'Rumi Dashboard',
      description: `I created a temporary dashboard link for **${message.guild.name}**.\n\n[Open dashboard](${url})`,
      fields: [
        { name: 'Guild', value: message.guild.name, inline: true },
        { name: 'Session', value: 'temporary signed link', inline: true }
      ],
      footer: { text: 'This link expires automatically. Do not share it.' }
    });
  }
};
