const respond = require('../../utils/respond');

module.exports = {
  name: 'newest',
  aliases: ["newestmembers"],
  category: 'server',
  description: "Shows newest cached accounts.",
  usage: "newest",
  examples: ["newest"],

  async execute({ message, args }) {
    const members = [...message.guild.members.cache.values()]
      .sort((a, b) => b.user.createdTimestamp - a.user.createdTimestamp)
      .slice(0, 10);
    return respond.reply(message, 'info', members.map((m, i) => `**${i + 1}.** ${m.user.tag} — <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`).join('\n'));
  }
};
