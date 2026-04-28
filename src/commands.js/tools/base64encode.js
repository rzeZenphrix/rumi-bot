const respond = require('../../utils/respond');

function encodeBase64(text, urlSafe = false) {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  if (!urlSafe) return encoded;
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

module.exports = {
  name: 'base64encode',
  aliases: ['b64e'],
  category: 'tools',
  description: 'Encode text to Base64 or Base64URL.',
  usage: 'base64encode [url] <text>',
  examples: ['base64encode hello world', 'base64encode url hello world'],

  async execute({ message, args }) {
    const mode = String(args[0] || '').toLowerCase();
    const urlSafe = mode === 'url' || mode === '--url' || mode === 'base64url';
    const text = (urlSafe ? args.slice(1) : args).join(' ');

    if (!text) {
      return respond.reply(message, 'info', 'Use `base64encode [url] <text>`.');
    }

    const output = encodeBase64(text, urlSafe);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Encoded your text as **${urlSafe ? 'Base64URL' : 'Base64'}**.`,
      fields: [
        { name: 'Input Length', value: String(text.length), inline: true },
        { name: 'Output Length', value: String(output.length), inline: true },
        { name: 'Mode', value: urlSafe ? 'URL-safe' : 'Standard', inline: true },
        { name: 'Output', value: `\`\`\`\n${output.slice(0, 1000)}\n\`\`\`` }
      ]
    });
  }
};
