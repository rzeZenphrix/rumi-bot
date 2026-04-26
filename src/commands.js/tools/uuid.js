const crypto = require('node:crypto');
const respond = require('../../utils/respond');

module.exports = {
  name: 'uuid',
  aliases: ["guid"],
  category: 'tools',
  description: "Generates a UUID.",
  usage: "uuid",
  examples: ["uuid"],

  async execute({ message, args }) {
    return respond.reply(message, 'info', crypto.randomUUID());
  }
};
