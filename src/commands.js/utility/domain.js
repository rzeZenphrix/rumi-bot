const respond = require('../../utils/respond');
module.exports = {
  name: 'domain',
  aliases: ["dns"],
  category: 'utility',
  description: "Lookup domain info.",
  usage: 'domain',
  async execute({ message }) {
    return respond.reply(message, 'info', "Domain lookup command is registered.", { mentionUser: false });
  }
};
