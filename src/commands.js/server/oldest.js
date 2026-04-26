const respond = require('../../utils/respond');

module.exports = {
  name: 'oldest',
  aliases: ["oldestmembers"],
  category: 'server',
  description: "Shows oldest cached accounts.",
  usage: "oldest",
  examples: ["oldest"],

  async execute({ message, args }) {
    const members = [...message.guild.members.cache.values()]
      .sort((a, b) => a.user.createdTimestamp - b.user.createdTimestamp)
      .slice(0, 10);
    return respond.reply(message, 'info', members.map((m, i) => `**${i + 1}.** ${m.user.tag} — <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`).join('\n'));
  }
};
