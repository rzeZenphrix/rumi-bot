const respond = require('../../utils/respond');
const { resolveMember } = require('../../utils/resolveUser');

function removeModeArg(args) {
  const first = String(args[0] || '').toLowerCase();

  if (first === 'user' || first === 'member' || first === 'bot') {
    return args.shift();
  }

  return null;
}

module.exports = {
  name: 'serverbanner',
  aliases: ['sbanner', 'memberbanner'],
  category: 'info',
  description: 'Show a member server-profile banner if Discord exposes one.',
  usage: 'serverbanner [user|bot] [member]',
  examples: ['serverbanner', 'serverbanner @user', 'serverbanner bot @bot'],
  guildOnly: true,

  async execute({ message, args }) {
    const mode = removeModeArg(args);

    const member = args[0]
      ? await resolveMember(message.guild, args[0])
      : message.member;

    if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
    if (mode === 'bot' && !member.user.bot) return respond.reply(message, 'bad', 'That member is not a bot.');
    if ((mode === 'user' || mode === 'member') && member.user.bot) return respond.reply(message, 'bad', 'That member is a bot.');

    const fetched = await message.guild.members.fetch(member.id).catch(() => member);

    const url =
      fetched.displayBannerURL?.({
        size: 4096,
        extension: 'png',
        forceStatic: false
      }) ||
      fetched.bannerURL?.({
        size: 4096,
        extension: 'png',
        forceStatic: false
      });

    if (!url) {
      return respond.reply(message, 'bad', 'That member does not have a visible server-profile banner.');
    }

    return respond.reply(message, 'info', null, {
      title: `${fetched.user.tag || fetched.user.username}'s server banner`,
      description: `[Open server banner](${url})`,
      image: url
    });
  }
};