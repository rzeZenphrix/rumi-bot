const respond = require('../../utils/respond');
module.exports = {
  name: 'vote', aliases: ['votebot'], category: 'core',
  description: 'I show vote links.', usage: 'vote', examples: ['vote'],
  async execute({ message }) {
    const urls = (process.env.VOTE_URLS || process.env.VOTE_URL || '').split(',').map(x => x.trim()).filter(Boolean);
    return respond.reply(message, urls.length ? 'info' : 'bad', null, { description: urls.length ? `🗳️ **Vote links**\n${urls.map((u,i)=>`**${i+1}.** ${u}`).join('\n')}` : '🗳️ I do not have vote links configured yet.' });
  }
};
