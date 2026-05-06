const respond = require('../../utils/respond');
module.exports = {
  name: 'shard', aliases: ['shards'], category: 'core', description: 'Show shard info.', usage: 'shard <info|ping>', examples: ['shard info','shard ping'],
  async execute({ client, message, args }) {
    const sub = (args.shift() || 'info').toLowerCase();
    const shardIds = client.shard?.ids || [0];
    if (sub === 'ping') return respond.reply(message, 'info', null, { description: `📡 **Shard ping**\n**Current shard:** \`${message.guild?.shardId ?? shardIds.join(',')}\`\n**WebSocket:** \`${Math.round(client.ws.ping)}ms\`` });
    return respond.reply(message, 'info', null, { description: `**Shard info**\n**Shard IDs:** \`${shardIds.join(', ')}\`\n**Total shards:** \`${client.options.shardCount || client.ws.shards.size || 'auto'}\`\n**Guild shard:** \`${message.guild?.shardId ?? 'DM'}\`` });
  }
};
