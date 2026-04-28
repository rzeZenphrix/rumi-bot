const respond = require('../../utils/respond');

module.exports = {
  name: 'urlencode',
  aliases: ['encodeurl'],
  category: 'tools',
  description: 'Percent-encode text for URLs.',
  usage: 'urlencode <text>',
  examples: ['urlencode hello world', 'urlencode hello@example.com'],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) {
      return respond.reply(message, 'info', 'Use `urlencode <text>`.');
    }

    const output = encodeURIComponent(text);
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: 'Encoded your text for URL use.',
      fields: [
        { name: 'Input', value: `\`\`\`\n${text.slice(0, 1000)}\n\`\`\`` },
        { name: 'Encoded', value: `\`\`\`\n${output.slice(0, 1000)}\n\`\`\`` }
      ]
    });
  }
};
