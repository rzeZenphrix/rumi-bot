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
  name: 'serveravatar',
  aliases: ['sav', 'savatar', 'serverpfp'],
  category: 'info',
  description: 'Show a member server avatar.',
  usage: 'serveravatar [user|bot] [member]',
  examples: ['serveravatar', 'serveravatar @user', 'serveravatar bot @bot'],
  guildOnly: true,

  async execute({ message, args }) {
    const mode = removeModeArg(args);

    const member = args[0]
      ? await resolveMember(message.guild, args[0])
      : message.member;

    if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
    if (mode === 'bot' && !member.user.bot) return respond.reply(message, 'bad', 'That member is not a bot.');
    if ((mode === 'user' || mode === 'member') && member.user.bot) return respond.reply(message, 'bad', 'That member is a bot.');

    const url = member.displayAvatarURL({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    return respond.reply(message, 'info', null, {
      title: `${member.user.tag || member.user.username}'s server avatar`,
      description: `[Open server avatar](${url})`,
      image: url
    });
  }
};