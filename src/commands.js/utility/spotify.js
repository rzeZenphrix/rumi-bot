const respond = require('../../utils/respond');
module.exports = {
  name: 'spotify',
  aliases: ["spoti"],
  category: 'utility',
  description: "Spotify tools.",
  usage: 'spotify',
  async execute({ message }) {
    return respond.reply(message, 'info', "Spotify command is registered.", { mentionUser: false });
  }
};
