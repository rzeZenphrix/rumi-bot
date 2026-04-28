const respond = require('../../utils/respond');

module.exports = {
  name: 'urldecode',
  aliases: ['decodeurl'],
  category: 'tools',
  description: 'Decode percent-encoded URL text.',
  usage: 'urldecode <text>',
  examples: ['urldecode hello%20world', 'urldecode hello%40example.com'],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) {
      return respond.reply(message, 'info', 'Use `urldecode <text>`.');
    }

    try {
      const output = decodeURIComponent(text);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: 'Decoded your URL text.',
        fields: [
          { name: 'Input', value: `\`\`\`\n${text.slice(0, 1000)}\n\`\`\`` },
          { name: 'Decoded', value: `\`\`\`\n${output.slice(0, 1000)}\n\`\`\`` }
        ]
      });
    } catch {
      return respond.reply(message, 'bad', 'I could not decode that URL text.');
    }
  }
};
