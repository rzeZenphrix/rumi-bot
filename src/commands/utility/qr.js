const respond = require('../../utils/respond');

module.exports = {
  name: 'qr',
  aliases: ['qrcode'],
  category: 'utility',
  description: 'Generate a QR code with size controls.',
  usage: 'qr <text|url> [--size 512] [--margin 1]',
  examples: ['qr https://rumi.rocks', 'qr hello world --size 256'],
  flags: [
    { name: '--size <px>', description: 'QR size in pixels (128-1024, default 512).' },
    { name: '--margin <px>', description: 'Margin size (0-10, default 1).' }
  ],

  async execute({ message, args }) {
    const sizeIndex = args.indexOf('--size');
    const marginIndex = args.indexOf('--margin');
    const size = Math.max(128, Math.min(1024, Number(args[sizeIndex + 1]) || 512));
    const margin = Math.max(0, Math.min(10, Number(args[marginIndex + 1]) || 1));
    const text = args
      .filter((value, index) => ![sizeIndex, sizeIndex + 1, marginIndex, marginIndex + 1].includes(index))
      .join(' ')
      .trim();

    if (!text) return respond.reply(message, 'info', 'Use `qr <text|url> [--size 512]`.');

    const image = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(text)}`;
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'QR code',
      allowTitle: true,
      description: `Encoded text:\n\`${text.slice(0, 180)}\``,
      image,
      fields: [
        { name: 'Size', value: `${size}px`, inline: true },
        { name: 'Margin', value: String(margin), inline: true }
      ]
    });
  }
};
