const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'dare',
  aliases: [],
  category: 'fun',
  description: 'I give a safe dare.',
  usage: 'dare',
  examples: ['dare'],

  async execute({ message }) {
    const prompt = await getPrompt('dare', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a dare right now.');
    }

    return respond.reply(message, 'info', null, {
      title: 'Dare',
      allowTitle: true,
      description: prompt.text,
      mentionUser: false
    });
  }
};
