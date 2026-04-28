const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'compliment',
  aliases: ['nice'],
  category: 'fun',
  description: 'Gives a compliment.',
  usage: 'compliment [user]',
  examples: ['compliment @buchi'],

  async execute({ message }) {
    const target = message.mentions.users.first() || message.author;
    const prompt = await getPrompt('compliment', {
      guildId: message.guild?.id,
      context: {
        target: `${target}`
      }
    });

    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a compliment right now.');
    }

    return respond.reply(message, 'good', prompt.text, { mentionUser: false });
  }
};
