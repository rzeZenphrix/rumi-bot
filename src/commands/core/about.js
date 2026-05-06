const os = require('node:os');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const pkg = require('../../../package.json');

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function memoryMb() {
  const memory = process.memoryUsage();
  return `${Math.round(memory.rss / 1024 / 1024)} MB`;
}

module.exports = {
  name: 'about',
  aliases: [],
  category: 'core',
  description: 'Show Rumi runtime, shard, database, and service information.',
  usage: 'about',
  examples: ['about'],
  async execute({ client, message }) {
    const dbCheck = await db.dbHealthCheck().catch((error) => ({
      ok: false,
      latencyMs: 0,
      error: error.message
    }));

    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
    const shardIds = client.shard?.ids?.join(', ') || String(message.guild?.shardId ?? 0);
    const shardCount = client.shard?.count || client.ws.shards.size || 1;
    const dashboard = process.env.DASHBOARD_URL || process.env.BOT_WEBSITE || 'not configured';

    return respond.reply(message, 'info', null, {
      title: 'Rumi',
      description: [
        'I am Rumi, a moderation, security, utility, and automation bot.',
        '',
        `Version: \`${pkg.version}\``,
        `Uptime: \`${formatUptime(process.uptime() * 1000)}\``,
        `Shard: \`${shardIds}/${shardCount}\``,
        `Cluster: \`${process.env.CLUSTER_ID || 'local'}\``,
        `Memory: \`${memoryMb()}\``,
        `Guilds: \`${guildCount.toLocaleString()}\``,
        `Users: \`${userCount.toLocaleString()}\``,
        `Commands: \`${new Set([...client.commands.values()].map((command) => command.name)).size}\``,
        `Database: \`${dbCheck.ok ? `online, ${dbCheck.latencyMs}ms` : dbCheck.error || 'unavailable'}\``,
        `Discord: \`online, ${Math.round(client.ws.ping)}ms WS\``,
        `Dashboard: ${dashboard}`,
        '',
        `Node: \`${process.version}\``,
        `Platform: \`${os.platform()} ${os.arch()}\``
      ].join('\n')
    });
  }
};
