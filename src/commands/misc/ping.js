const db = require('../../services/database');

module.exports = {
  name: 'ping',
  aliases: ['pong'],
  category: 'core',
  description: 'Check Rumi latency and service health.',
  usage: 'ping',
  typing: false,

  async execute({ client, message }) {
    const started = Date.now();
    const sent = await message.channel.send({ content: 'Pong.', allowedMentions: { parse: [] } });
    const editMs = Date.now() - started;

    let dbText = 'not configured';

    try {
      const health = await db.dbHealthCheck();
      dbText = health.ok ? `${health.latencyMs}ms` : (health.error || 'unavailable');
    } catch (error) {
      dbText = error?.message || 'unavailable';
    }

    const apiMs = Date.now() - started;
    const shardId = message.guild?.shardId ?? client.shard?.ids?.[0] ?? 0;

    return sent.edit({
      content: [
        'Pong.',
        '',
        `API: ${apiMs}ms`,
        `WebSocket: ${Math.round(client.ws.ping)}ms`,
        `Database: ${dbText}`,
        `Shard: ${shardId}`,
        `Cluster: ${process.env.CLUSTER_ID || 'local'}`,
        `Edit: ${editMs}ms`
      ].join('\n'),
      allowedMentions: { parse: [] }
    });
  }
};
