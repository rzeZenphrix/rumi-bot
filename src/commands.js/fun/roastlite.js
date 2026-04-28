const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'roastlite',
  aliases: ['softroast', 'roast'],
  category: 'fun',
  description: 'Gives a harmless roast.',
  usage: 'roastlite [user]',
  examples: ['roastlite @buchi', 'roast @buchi'],

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
