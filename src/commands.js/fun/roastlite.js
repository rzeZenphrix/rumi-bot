const respond = require('../../utils/respond');

module.exports = {
  name: 'roastlite',
  aliases: ["softroast"],
  category: 'fun',
  description: "Gives a harmless roast.",
  usage: "roastlite [user]",
  examples: ["roastlite [user]"],

  async execute({ message, args }) {
    const target = message.mentions.users.first() || message.author;
    const lines = ['your Wi-Fi has more stability than your decisions.', 'you lag in real life.', 'your typing speed needs a loading screen.', 'your aura is buffering.'];
    return respond.reply(message, 'alert', `think ${target} ${lines[Math.floor(Math.random() * lines.length)]}`);
  }
};
