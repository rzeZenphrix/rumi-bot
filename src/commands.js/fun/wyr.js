const respond = require('../../utils/respond');
module.exports = {
  name: 'wyr',
  aliases: ["wouldyourather"],
  category: 'fun',
  description: "Get a would-you-rather prompt.",
  usage: 'wyr',
  async execute({ message }) {
    return respond.reply(message, 'info', "Would you rather have perfect timing or perfect memory?", { mentionUser: false });
  }
};
