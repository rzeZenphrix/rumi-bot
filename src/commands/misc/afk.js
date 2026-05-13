const respond = require('../../utils/respond');
const {
  setAfk,
  getAfkState,
  clearAfkByCommand,
  requireAfkRenamePremium
} = require('../../systems/afk/manager');

function cleanReason(text) {
  const reason = String(text || '').trim();
  return reason ? reason.slice(0, 80) : 'afk';
}

module.exports = {
  name: 'afk',
  aliases: [],
  category: 'server',
  description: 'Set yourself AFK in this server.',
  usage: 'afk [reason] | afk rename [reason] | afk clear',
  examples: [
    'afk sleep',
    'afk eating',
    'afk rename asleep',
    'afk clear'
  ],
  guildOnly: true,
  slash: true,
  subcommands: [
    {
      name: 'rename',
      description: 'Set AFK and add an [afk] nickname tag.',
      usage: 'afk rename [reason]',
      examples: ['afk rename in class']
    },
    {
      name: 'clear',
      aliases: ['off'],
      description: 'Clear your AFK state.',
      usage: 'afk clear',
      examples: ['afk clear']
    }
  ],

  async execute({ message, args, prefix }) {
    const sub = String(args[0] || '').toLowerCase();
    const wantsRename = sub === 'rename';
    const wantsClear = sub === 'clear' || sub === 'off';

    if (wantsClear) {
      const current = await getAfkState('guild', message.guild.id, message.author.id).catch(() => null);

      if (!current) {
        return respond.reply(message, 'info', `${message.author}: You are not afk right now.`, {
          mentionUser: false
        });
      }

      await clearAfkByCommand(message.member).catch(() => null);

      return respond.reply(message, 'info', 'Welcome back, your afk status has been cleared.', {
        mentionUser: false
      });
    }

    if (wantsRename) {
      const premium = await requireAfkRenamePremium(message);
      if (!premium) return null;
      args.shift();
    }

    const reason = cleanReason(args.join(' '));
    await setAfk(message.member, 'guild', reason, wantsRename);

    return respond.reply(message, 'up', `You're now afk with the status: \`${reason}\``, {
      mentionUser: false
    });
  }
};
