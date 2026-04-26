const respond = require('../../utils/respond');
module.exports = {
  name: 'profile',
  aliases: ["profileview"],
  category: 'social',
  description: "Show a simple profile card.",
  usage: 'profile',
  async execute({ message }) {
    return respond.reply(message, 'info', "Profile cards are ready. Full canvas cards come next.", { mentionUser: false });
  }
};
