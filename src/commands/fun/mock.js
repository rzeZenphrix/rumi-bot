const respond = require('../../utils/respond');
const { getPrompt } = require('../../systems/fun/promptStore');

function mockCase(text = '') {
  return [...String(text || '')]
    .map((char, index) => (index % 2 ? char.toLowerCase() : char.toUpperCase()))
    .join('');
}

module.exports = {
  name: 'mock',
  aliases: ['spongebob'],
  category: 'fun',
  description: 'I alternate text casing.',
  usage: 'mock [text]',
  examples: ['mock hello there', 'mock'],

  async execute({ message, args }) {
    let text = args.join(' ').trim();

    if (!text) {
      const prompt = await getPrompt('mock', { guildId: message.guild?.id });
      if (!prompt.ok || !prompt.text) {
        return respond.reply(message, 'info', 'Send text to mock.');
      }
      text = prompt.text;
    }

    return respond.reply(message, 'info', null, {
      description: mockCase(text),
      mentionUser: false
    });
  }
};
