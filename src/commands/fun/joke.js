const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'joke',
  aliases: [],
  category: 'fun',
  description: 'Get a random joke.',
  usage: 'joke',
  examples: ['joke'],

  async execute({ message }) {
    const prompt = await getPrompt('joke', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a joke right now.');
    }

    return respond.reply(message, 'info', null, {
      allowTitle: true,
      description: prompt.text,
      mentionUser: false
    });
  }
};
