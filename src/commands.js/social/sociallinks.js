const respond = require('../../utils/respond');
module.exports = {
  name: 'sociallinks',
  aliases: ["links"],
  category: 'social',
  description: "Manage profile social links.",
  usage: 'sociallinks',
  async execute({ message }) {
    return respond.reply(message, 'info', "Use `sociallinks add <url>` soon.", { mentionUser: false });
  }
};
