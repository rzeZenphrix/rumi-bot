const respond = require('../../utils/respond');
const { getUserCounts } = require('../../systems/counters/wordCounter');

module.exports = {
  name: 'nword',
  aliases: ['ncount'],
  category: 'misc',
  description: 'Shows your global tracked count for the n-word and hard-r variants.',
  usage: 'nword',
  examples: ['nword'],

  async execute({ message }) {
    const counts = getUserCounts(message.author.id);

    return respond.reply(message, 'info', null, {
      title: `${message.author.username}'s global word counter`,
      fields: [
        {
          name: 'N-word total',
          value: String(counts.nwordTotal || 0),
          inline: true
        },
        {
          name: 'Hard-r total',
          value: String(counts.hardR || 0),
          inline: true
        }
      ],
      footer: {
        text: 'Only counts messages Rumi sees after this system is installed.'
      }
    });
  }
};