const respond = require('../../utils/respond');
module.exports = {
  name: 'iplookup',
  aliases: ["ip"],
  category: 'utility',
  description: "Lookup IP info.",
  usage: 'iplookup',
  async execute({ message }) {
    return respond.reply(message, 'info', "IP lookup command is registered with privacy limits.", { mentionUser: false });
  }
};
