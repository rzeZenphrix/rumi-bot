const respond = require('../../utils/respond');
module.exports = {
  name: 'mines',
  aliases: ["minefield"],
  category: 'fun',
  description: "Start a tiny mines preview.",
  usage: 'mines',
  async execute({ message }) {
    return respond.reply(message, 'info', "⬜ ⬜ 💣\n⬜ ✅ ⬜\n💣 ⬜ ⬜", { mentionUser: false });
  }
};
