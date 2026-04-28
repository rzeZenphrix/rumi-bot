const respond = require('../../utils/respond');

function normalizeBase64(input) {
  const normalized = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  return padding ? normalized.padEnd(normalized.length + (4 - padding), '=') : normalized;
}

module.exports = {
  name: 'base64decode',
  aliases: ['b64d'],
  category: 'tools',
  description: 'Decode Base64 or Base64URL text.',
  usage: 'base64decode <text>',
  examples: ['base64decode aGVsbG8gd29ybGQ=', 'base64decode aGVsbG8td29ybGQ'],

  async execute({ message, args }) {
    const text = args.join('');
    if (!text) {
      return respond.reply(message, 'info', 'Use `base64decode <text>`.');
    }

    try {
      const output = Buffer.from(normalizeBase64(text), 'base64').toString('utf8');
      if (!output) throw new Error('Empty output');

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: 'Decoded your Base64 text.',
        fields: [
          { name: 'Input Length', value: String(text.length), inline: true },
          { name: 'Output Length', value: String(output.length), inline: true },
          { name: 'Output', value: `\`\`\`\n${output.slice(0, 1000)}\n\`\`\`` }
        ]
      });
    } catch {
      return respond.reply(message, 'bad', 'I could not decode that Base64 text.');
    }
  }
};
