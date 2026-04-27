const respond = require('../../utils/respond');

module.exports = {
  name: 'support',
  aliases: [],
  category: 'core',
  description: 'Show the support server link.',
  usage: 'support',
  examples: ['support'],

  async execute({ message }) {
    const url = process.env.SUPPORT_URL || process.env.DISCORD_SUPPORT_URL || null;

    return respond.reply(message, url ? 'info' : 'bad', null, {
      title: 'Support',
      description: url
        ? `You can get help here:\n${url}`
        : 'I do not have a support server link configured yet.'
    });
  }
};
