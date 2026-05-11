const os = require('node:os');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');

const respond = require('../../utils/respond');
const db = require('../../services/database');
const pkg = require('../../../package.json');

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function percent(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
}

function progressBar(value, max, width = 12) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function shardLabel(client, message) {
  const shardIds = client.shard?.ids?.join(', ') || String(message.guild?.shardId ?? 0);
  const shardCount = client.shard?.count || client.ws.shards.size || 1;
  return `${shardIds}/${shardCount}`;
}

function uniqueCommandCount(client) {
  if (!client.commands?.values) return 0;
  return new Set([...client.commands.values()].map((command) => command.name)).size;
}

function commandCategoryCount(client) {
  if (!client.commands?.values) return 0;
  return new Set(
    [...client.commands.values()]
      .map((command) => command.category)
      .filter(Boolean)
  ).size;
}

function guildUserCount(client) {
  return client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
}

function botAvatar(client) {
  return client.user?.displayAvatarURL?.({ size: 256 }) || null;
}

function buttonRow({ dashboard, support }) {
  const row = new ActionRowBuilder();
  let added = 0;

  if (dashboard) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(dashboard)
    );
    added += 1;
  }

  if (support) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(support)
    );
    added += 1;
  }

  return added ? row : null;
}

function line(label, value) {
  return `**${label}:** \`${value}\``;
}

function buildAboutComponents({ client, message, dbCheck }) {
  const memory = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedSystemMem = totalMem - freeMem;
  const load = os.loadavg?.()[0] || 0;
  const cpuCount = os.cpus?.().length || 1;
  const loadPercent = Math.min(100, (load / cpuCount) * 100);

  const guildCount = client.guilds.cache.size;
  const userCount = guildUserCount(client);
  const commandCount = uniqueCommandCount(client);
  const categoryCount = commandCategoryCount(client);
  const dashboard = safeUrl(process.env.DASHBOARD_URL || process.env.BOT_WEBSITE);
  const support = safeUrl(process.env.SUPPORT_URL || process.env.BOT_SUPPORT_URL || process.env.DISCORD_SUPPORT_URL);

  const accentColor = Number.parseInt(
    String(process.env.ABOUT_ACCENT_COLOR || process.env.BOT_ACCENT_COLOR || '8fb7ff').replace('#', ''),
    16
  );

  const dbStatus = dbCheck.ok
    ? `online · ${dbCheck.latencyMs}ms`
    : `offline · ${dbCheck.error || 'unavailable'}`;

  const wsPing = Number.isFinite(client.ws.ping) ? `${Math.round(client.ws.ping)}ms` : 'N/A';

  const header = [
    `# ${client.user?.username || 'Rumi'}`,
    '',
    pkg.description || 'A clean multi-function Discord bot.',
    '',
    `Version \`${pkg.version}\` · Node \`${process.version}\``
  ].join('\n');

  const overview = [
    line('Uptime', formatUptime(process.uptime() * 1000)),
    line('Shard', shardLabel(client, message)),
    line('Cluster', process.env.CLUSTER_ID || 'local'),
    line('Discord WS', wsPing),
    line('Database', dbStatus)
  ].join('\n');

  const reach = [
    line('Servers', guildCount.toLocaleString()),
    line('Users', userCount.toLocaleString()),
    line('Commands', commandCount.toLocaleString()),
    line('Categories', categoryCount.toLocaleString())
  ].join('\n');

  const runtime = [
    line('RSS Memory', formatBytes(memory.rss)),
    line('Heap Used', formatBytes(memory.heapUsed)),
    line('Heap Total', formatBytes(memory.heapTotal)),
    line('System Memory', `${formatBytes(usedSystemMem)} / ${formatBytes(totalMem)}`),
    `\`${progressBar(usedSystemMem, totalMem)}\` ${percent((usedSystemMem / totalMem) * 100)}`,
    line('CPU Load', `${load.toFixed(2)} / ${cpuCount} cores`),
    `\`${progressBar(load, cpuCount)}\` ${percent(loadPercent)}`
  ].join('\n');

  const system = [
    line('Platform', `${os.platform()} ${os.arch()}`),
    line('Host', os.hostname()),
    line('Process ID', process.pid),
    line('Environment', process.env.NODE_ENV || 'development')
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(Number.isFinite(accentColor) ? accentColor : 0x8fb7ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(header)
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Status\n${overview}`),
      new TextDisplayBuilder().setContent(`## Reach\n${reach}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Runtime\n${runtime}`),
      new TextDisplayBuilder().setContent(`## System\n${system}`)
    );

  const row = buttonRow({ dashboard, support });
  if (row) container.addActionRowComponents(row);

  return [container];
}

module.exports = {
  name: 'about',
  aliases: ['botinfo'],
  category: 'core',
  description: 'Show detailed information about the bot.',
  usage: 'about',
  examples: ['about'],

  async execute({ client, message }) {
    const dbCheck = await db.dbHealthCheck().catch((error) => ({
      ok: false,
      latencyMs: 0,
      error: error.message
    }));

    try {
      return message.channel.send({
        components: buildAboutComponents({ client, message, dbCheck }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      return respond.reply(message, 'bad', error.message || 'Could not render the about panel.', {
        mentionUser: false
      });
    }
  }
};