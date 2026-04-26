const respond = require('../../utils/respond');
module.exports = {
  name: 'translate',
  aliases: ["tr"],
  category: 'utility',
  description: "Translate text.",
  usage: 'translate',
  async execute({ message }) {
    return respond.reply(message, 'info', "Translation command is registered.", { mentionUser: false });
  }
};
