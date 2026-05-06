const respond = require('../../utils/respond');
module.exports = {
  name: 'slots',
  aliases: ["slot"],
  category: 'fun',
  description: "Spin simple slots.",
  usage: 'slots',
  async execute({ message }) {
    return respond.reply(message, 'info', "🍒 | ⭐ | 🍒", { mentionUser: false });
  }
};
