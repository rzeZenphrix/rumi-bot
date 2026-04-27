const respond = require('../../utils/respond');
const { resolveMember, resolveUser } = require('../../utils/resolveUser');

module.exports = {
  name: 'userinfo',
  aliases: ['ui', 'whois'],
  category: 'utility',
  description: 'I show user profile data, even by raw ID when possible.',
  usage: 'userinfo [user]',
  examples: ['userinfo @user', 'userinfo 123456789012345678'],
  guildOnly: true,

  async execute({ client, message, args }) {
    const member = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    const user = member?.user || (args[0] ? await resolveUser(client, args[0]) : message.author);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    return respond.reply(message, 'info', null, {
      thumbnail: user.displayAvatarURL(),
      description: [
        `👤 **User info**`,
        `**User:** ${user.tag || user.username}`,
        `**ID:** \`${user.id}\``,
        `**Bot:** \`${user.bot ? 'yes' : 'no'}\``,
        `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
        `**Joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'not in this server'}`,
        `**Roles:** \`${member ? Math.max(0, member.roles.cache.size - 1) : 0}\``
      ].join('\n')
    });
  }
};
