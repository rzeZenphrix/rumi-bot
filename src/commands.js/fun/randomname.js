const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'randomname',
  aliases: ['namegen'],
  category: 'fun',
  description: 'Generate a random display name.',
  usage: 'randomname',
  examples: ['randomname'],

  async execute({ message }) {
    const prompt = await getPrompt('randomname', { guildId: message.guild?.id });
    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not generate a name right now.');
    }

    return respond.reply(message, 'info', prompt.text, { mentionUser: false });
  }
};
