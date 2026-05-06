const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'fact',
  aliases: ['randomfact'],
  category: 'fun',
  description: 'I share a random fact.',
  usage: 'fact',
  examples: ['fact'],

  async execute({ message }) {
    const prompt = await getPrompt('fact', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a fact right now.');
    }

    return respond.reply(message, 'info', null, {
      title: 'Fact',
      allowTitle: true,
      description: prompt.text,
      mentionUser: false
    });
  }
};
