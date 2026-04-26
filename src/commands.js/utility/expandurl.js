const respond = require('../../utils/respond');
module.exports = {
  name: 'expandurl',
  aliases: ["unshorten"],
  category: 'utility',
  description: "Expand a short URL.",
  usage: 'expandurl',
  async execute({ message }) {
    return respond.reply(message, 'info', "URL expander command is registered.", { mentionUser: false });
  }
};
