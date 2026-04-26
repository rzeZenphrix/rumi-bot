const respond = require('../../utils/respond');
const db = require('../../services/database');
module.exports = {
  name: 'premium', aliases: ['prem'], category: 'core',
  description: 'I show premium status and perks.', usage: 'premium [status|features]', examples: ['premium'],
  async execute({ message, args }) {
    const row = await db.getKv('premium', message.guild?.id || message.author.id, { tier: 'free' }).catch(() => ({ tier: 'free' }));
    return respond.reply(message, 'info', null, { description: `💎 **Premium status**\n**Tier:** \`${row.tier || 'free'}\`\n\n**Perks I can support:** extended logging, larger automation limits, premium dashboards, priority AI tools, and advanced analytics.` });
  }
};
