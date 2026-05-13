const respond = require('../../utils/respond');

module.exports = {
  name: 'sus',
  aliases: ["susscore"],
  category: 'fun',
  description: "Shows a sus score.",
  usage: "sus [user]",
  examples: ["sus [user]"],

  async execute({ message, args }) {
    const target = message.mentions.users.first() || message.author;
    return respond.reply(message, '', `i think ${target} is **${Math.floor(Math.random() * 101)}%** sus.`);
  }
};
