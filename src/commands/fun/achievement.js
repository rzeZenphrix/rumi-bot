const respond = require('../../utils/respond');
module.exports = {
  name: 'achievement',
  aliases: ["achievements"],
  category: 'fun',
  description: "Show a simple achievement.",
  usage: 'achievement',
  async execute({ message }) {
    return respond.reply(message, 'info', "This feature is not ready.", { mentionUser: false });
  }
};