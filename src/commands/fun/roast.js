const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'roast',
  aliases: [],
  category: 'fun',
  description: 'Roast a user.',
  usage: 'roast [user]',
  examples: ['roast @muffet', 'roast @comfort'],

  async execute({ message }) {
    const target = message.mentions.users.first() || message.author;
    const prompt = await getPrompt('roast', {
      guildId: message.guild?.id,
      context: {
        target: `${target}`
      }
    });

    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a roast right now.');
    }

    return respond.reply(message, 'alert', prompt.text, { mentionUser: false });
  }
};
