const respond = require('../../utils/respond');
module.exports = {
  name: 'quest',
  aliases: ["quests"],
  category: 'fun',
  description: "Get a mini quest.",
  usage: 'quest',
  async execute({ message }) {
    return respond.reply(message, 'info', "Earn 3 positive reactions today.", { mentionUser: false });
  }
};
