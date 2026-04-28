const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'wyr',
  aliases: ['wouldyourather'],
  category: 'fun',
  description: 'Get a would-you-rather prompt.',
  usage: 'wyr',
  examples: ['wyr'],

  async execute({ message }) {
    const prompt = await getPrompt('wyr', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a would-you-rather prompt right now.');
    }

    return respond.reply(message, 'info', prompt.text, { mentionUser: false });
  }
};
