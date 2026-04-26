const os = require('node:os');
const respond = require('../../utils/respond');
function fmt(ms){const s=Math.floor(ms/1000); const d=Math.floor(s/86400); const h=Math.floor((s%86400)/3600); const m=Math.floor((s%3600)/60); return `${d}d ${h}h ${m}m`;}
module.exports = {
  name: 'stats', aliases: ['botstats'], category: 'core',
  description: 'I show runtime and cache statistics.', usage: 'stats', examples: ['stats'],
  async execute({ client, message }) {
    const users = client.guilds.cache.reduce((n,g)=>n+(g.memberCount||0),0);
    return respond.reply(message, 'info', null, { description: `📊 **My stats**\n**Guilds:** \`${client.guilds.cache.size}\`\n**Approx users:** \`${users}\`\n**Commands:** \`${client.commands.size}\`\n**Uptime:** \`${fmt(process.uptime()*1000)}\`\n**Memory:** \`${Math.round(process.memoryUsage().rss/1024/1024)} MB\`\n**CPU:** \`${os.cpus()?.[0]?.model || 'unknown'}\`` });
  }
};
