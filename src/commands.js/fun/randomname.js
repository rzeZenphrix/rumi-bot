const respond = require('../../utils/respond');
module.exports = {
  name: 'randomname',
  aliases: ["namegen"],
  category: 'fun',
  description: "Generate a random display name.",
  usage: 'randomname',
  async execute({ message }) {
    return respond.reply(message, 'info', "Nyx Hollow", { mentionUser: false });
  }
};
