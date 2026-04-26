const respond = require('../../utils/respond');
module.exports = {
  name: 'support', aliases: ['server'], category: 'core',
  description: 'I show the support server link.', usage: 'support', examples: ['support'],
  async execute({ message }) {
    const url = process.env.SUPPORT_URL || process.env.DISCORD_SUPPORT_URL || null;
    return respond.reply(message, url ? 'info' : 'bad', null, { description: url ? `🛟 **Support**\nYou can get help here: ${url}` : '🛟 I do not have a support server link configured yet.' });
  }
};
