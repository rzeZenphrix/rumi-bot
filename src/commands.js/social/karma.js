const respond = require('../../utils/respond');
module.exports = {
  name: 'karma',
  aliases: ["repkarma"],
  category: 'social',
  description: "Give or view karma.",
  usage: 'karma',
  async execute({ message }) {
    return respond.reply(message, 'info', "Karma system is online.", { mentionUser: false });
  }
};
