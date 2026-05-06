const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

module.exports = {
  name: 'truthdeep',
  aliases: ['deeptruth'],
  category: 'fun',
  description: 'Get a deeper truth prompt.',
  usage: 'truthdeep',
  examples: ['truthdeep'],
  guildOnly: true,

  async execute({ message }) {
    const prompt = await getPrompt('truthdeep', {
      guildId: message.guild?.id,
      safety: 'nsfw'
    });

    if (!prompt.ok && prompt.reason === 'nsfw_disabled') {
      return respond.reply(message, 'bad', 'Deep truth prompts need `nsfw toggle on` in this server first.');
    }

    if (!prompt.ok || !prompt.text) {
      return respond.reply(message, 'bad', 'I could not find a deep truth prompt right now.');
    }

    return respond.reply(message, 'info', null, {
      title: 'Deep Truth',
      allowTitle: true,
      description: prompt.text,
      mentionUser: false
    });
  }
};
