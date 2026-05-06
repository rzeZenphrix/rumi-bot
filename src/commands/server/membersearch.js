const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');
const { findRole } = require('../../utils/roleResolver');

function chunk(items = [], size = 15) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

module.exports = {
  name: 'membersearch',
  aliases: ['ms'],
  category: 'server',
  description: 'Look up server members by a role.',
  usage: 'membersearch <role mention|id|name>',
  examples: ['membersearch @Moderators', 'membersearch Helpers'],
  guildOnly: true,

  async execute({ message, args }) {
    const role = await findRole(message.guild, args.join(' '));
    if (!role) {
      return respond.reply(message, 'info', 'Use `membersearch <role mention|id|name>`.', { mentionUser: false });
    }

    const members = role.members
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((member) => ({
        id: member.id,
        label: `${member} (${member.user.tag})`
      }));

    if (!members.length) {
      return respond.reply(message, 'info', `${role} has no members right now.`, { mentionUser: false });
    }

    const pages = chunk(members, 15).map((slice, pageIndex, allPages) => ({
      title: `Member Search | ${role.name}`,
      allowTitle: true,
      description: slice
        .map((entry, index) => `**${pageIndex * 15 + index + 1}.** ${entry.label}\n\`${entry.id}\``)
        .join('\n\n'),
      footer: {
        text: `Page ${pageIndex + 1}/${allPages.length} - ${members.length} member(s)`
      },
      thumbnail: message.guild.iconURL({ dynamic: true }),
      mentionUser: false
    }));

    const payload = createPagedMessage({
      prefix: 'membersearch',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
