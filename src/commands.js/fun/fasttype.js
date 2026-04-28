const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'fasttype',
  aliases: ['typingtest'],
  category: 'fun',
  description: 'Send a fast typing phrase.',
  usage: 'fasttype',
  examples: ['fasttype'],

  async execute({ message }) {
    const prompt = await getPrompt('fasttype', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a typing phrase right now.');
    }

    return respond.reply(message, 'info', `Type this: ${prompt.text}`, { mentionUser: false });
  }
};
