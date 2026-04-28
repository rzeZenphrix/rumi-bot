const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'truth',
  aliases: [],
  category: 'fun',
  description: 'I give a safe truth question.',
  usage: 'truth',
  examples: ['truth'],

  async execute({ message }) {
    const prompt = await getPrompt('truth', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a truth prompt right now.');
    }

    return respond.reply(message, 'info', null, {
      title: 'Truth',
      allowTitle: true,
      description: prompt.text,
      mentionUser: false
    });
  }
};
