const respond = require('../../utils/respond');
module.exports = {
  name: 'streak',
  aliases: ["streaks"],
  category: 'social',
  description: "View streak status.",
  usage: 'streak',
  async execute({ message }) {
    return respond.reply(message, 'info', "Current streak: 0 days.", { mentionUser: false });
  }
};
