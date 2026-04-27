const respond = require('../../utils/respond');

module.exports = {
  name: 'expandurl',
  aliases: ['unshorten'],
  category: 'utility',
  description: 'Expand a short URL.',
  usage: 'expandurl <url>',

  async execute({ message, args }) {
    const url = args[0];
    if (!url) return respond.reply(message, 'info', 'Use `expandurl <url>`.');

    try {
      const response = await fetch(url, { redirect: 'follow' });
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: `**Final URL:** ${response.url}`
      });
    } catch {
      return respond.reply(message, 'bad', 'I could not expand that URL.');
    }
  }
};
