const respond = require('../../utils/respond');

module.exports = {
  name: 'qr',
  aliases: ['qrcode'],
  category: 'utility',
  description: 'Generate a QR code.',
  usage: 'qr <text|url>',

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'Use `qr <text|url>`.');

    const image = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `QR code for:\n\`${text.slice(0, 120)}\``,
      image
    });
  }
};
