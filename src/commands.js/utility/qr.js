const respond = require('../../utils/respond');
module.exports = {
  name: 'qr',
  aliases: ["qrcode"],
  category: 'utility',
  description: "Generate QR code info.",
  usage: 'qr',
  async execute({ message }) {
    return respond.reply(message, 'info', "QR generation is registered. Canvas rendering comes next.", { mentionUser: false });
  }
};
