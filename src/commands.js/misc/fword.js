const respond = require('../../utils/respond');
const { getUserCounts } = require('../../systems/counters/wordCounter');

module.exports = {
  name: 'fword',
  aliases: ['fcount'],
  category: 'misc',
  description: 'Shows your global tracked count for fuck/fuh.',
  usage: 'fword',
  examples: ['fword'],

  async execute({ message }) {
    const counts = await getUserCounts(message.author.id);

    return respond.reply(message, 'info', null, {
      title: `${message.author.username}'s global word counter`,
      fields: [
        {
          name: 'F-word total',
          value: String(counts.fword || 0),
          inline: true
        },
        {
          name: 'Fuh total',
          value: String(counts.fuh || 0),
          inline: true
        }
      ],
      footer: {
        text: 'Only counts messages Rumi sees after this system is installed.'
      }
    });
  }
};
