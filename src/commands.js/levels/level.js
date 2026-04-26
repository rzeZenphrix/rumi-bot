const respond = require('../../utils/respond');
const { getUserLevel, neededXp } = require('../../systems/levels/levelStore');
const { makeRankCard } = require('../../services/canvas/rankCard');

module.exports = {
  name: 'level',
  aliases: ['rank'],
  category: 'levels',
  description: 'Shows a user level card.',
  usage: 'level [user]',

  async execute({ message }) {
    const user = message.mentions.users.first() || message.author;
    const member = message.guild.members.cache.get(user.id);
    const data = getUserLevel(message.guild.id, user.id);
    const next = neededXp(data.level + 1);

    const card = await makeRankCard({
      user,
      member,
      level: data.level,
      xp: data.xp,
      needed: next
    });

    return message.channel.send({
      files: [card],
      allowedMentions: { parse: [] }
    });
  }
};