const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'fortune',
  aliases: ['cookie'],
  category: 'fun',
  description: 'Get a fortune message.',
  usage: 'fortune',
  examples: ['fortune'],

  async execute({ message }) {
    const prompt = await getPrompt('fortune', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'This feature is not ready.');
    }

    return respond.reply(message, '', prompt.text, { mentionUser: false });
  }
};
