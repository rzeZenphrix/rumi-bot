const respond = require('../../utils/respond');
module.exports = {
  name: 'bio',
  aliases: ["aboutme"],
  category: 'social',
  description: "Set or view profile bio.",
  usage: 'bio',
  async execute({ message }) {
    return respond.reply(message, 'info', "Use `bio set <text>` or `bio view`.", { mentionUser: false });
  }
};
