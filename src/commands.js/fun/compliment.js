const respond = require('../../utils/respond');

module.exports = {
  name: 'compliment',
  aliases: ["nice"],
  category: 'fun',
  description: "Gives a compliment.",
  usage: "compliment [user]",
  examples: ["compliment [user]"],

  async execute({ message, args }) {
    const target = message.mentions.users.first() || message.author;
    const lines = ['you have elite energy.', 'your server presence is immaculate.', 'you are built different.', 'you are genuinely cool.'];
    return respond.reply(message, 'good', `think ${target} ${lines[Math.floor(Math.random() * lines.length)]}`);
  }
};
