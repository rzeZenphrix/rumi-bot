const respond = require('../../utils/respond');

module.exports = {
  name: 'vote',
  aliases: ['votebot'],
  category: 'core',
  description: 'Vote links.',
  usage: 'vote',
  examples: ['vote'],

  async execute({ message }) {
    const urls = (process.env.VOTE_URLS || process.env.VOTE_URL || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return respond.reply(message, urls.length ? 'info' : 'bad', null, {
      title: 'Vote Links',
      description: urls.length
        ? urls.map((url, index) => `**${index + 1}.** ${url}`).join('\n')
        : 'I do not have vote links configured yet.'
    });
  }
};
