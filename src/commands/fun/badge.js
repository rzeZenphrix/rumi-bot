const respond = require('../../utils/respond');
module.exports = {
  name: 'badge',
  aliases: ["badges"],
  category: 'fun',
  description: "Show badge info.",
  usage: 'badge',
  async execute({ message }) {
    return respond.reply(message, 'info', "This feature is not ready.", { mentionUser: false });
  }
};
