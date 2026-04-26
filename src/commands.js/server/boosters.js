const respond = require('../../utils/respond');

module.exports = {
  name: 'boosters',
  aliases: ["boosts"],
  category: 'server',
  description: "Lists server boosters.",
  usage: "boosters",
  examples: ["boosters"],

  async execute({ message, args }) {
    const boosters = message.guild.members.cache.filter(m => m.premiumSince).first(25);
    return respond.reply(message, 'info', boosters.map(m => `${m} — <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:R>`).join('\n') || 'found no cached boosters.');
  }
};
