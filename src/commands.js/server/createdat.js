const respond = require('../../utils/respond');

module.exports = {
  name: 'createdat',
  aliases: ["created"],
  category: 'server',
  description: "Shows when an account was created.",
  usage: "createdat [user]",
  examples: ["createdat [user]"],

  async execute({ message, args }) {
    const user = message.mentions.users.first() || message.author;
    return respond.reply(message, 'info', `${user} was created <t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>).`);
  }
};
