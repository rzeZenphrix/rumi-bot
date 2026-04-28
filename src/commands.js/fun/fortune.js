const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'fortune',
  aliases: ['cookie'],
  category: 'fun',
  description: 'Get a fortune-style message.',
  usage: 'fortune',
  examples: ['fortune'],

  async execute({ message }) {
    const prompt = await getPrompt('fortune', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a fortune right now.');
    }

    return respond.reply(message, 'info', prompt.text, { mentionUser: false });
  }
};
