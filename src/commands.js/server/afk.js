const respond = require('../../utils/respond');
const { setAfk, getAfkState, clearAfkByCommand, requireAfkRenamePremium } = require('../../systems/afk/manager');

module.exports = {
  name: 'afk',
  aliases: [],
  category: 'server',
  description: 'Set yourself AFK in this server.',
  usage: 'afk [reason] | afk rename [reason] | afk clear',
  examples: ['afk eating', 'afk rename asleep', 'afk clear'],
  guildOnly: true,
  subcommands: [
    {
      name: 'rename',
      description: 'Set AFK and add an [afk] nickname tag.',
      usage: 'afk rename [reason]',
      examples: ['afk rename in class']
    },
    {
      name: 'clear',
      description: 'Clear your local AFK state.',
      usage: 'afk clear',
      examples: ['afk clear']
    }
  ],

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();
    const wantsRename = sub === 'rename';
    const wantsClear = sub === 'clear' || sub === 'off';

    if (wantsClear) {
      const current = await getAfkState('guild', message.guild.id, message.author.id).catch(() => null);
      if (!current) {
        return respond.reply(message, 'info', 'You are not AFK in this server right now.', { mentionUser: false });
      }
      await clearAfkByCommand(message.member).catch(() => null);
      return respond.reply(message, 'good', 'Cleared your AFK state for this server.', { mentionUser: false });
    }

    if (wantsRename) {
      const premium = await requireAfkRenamePremium(message);
      if (!premium) return null;
      args.shift();
    }

    const reason = args.join(' ').trim();
    const state = await setAfk(message.member, 'guild', reason, wantsRename);
    return respond.reply(message, 'good', null, {
      mentionUser: false,
      title: 'AFK enabled',
      allowTitle: true,
      description: [
        `Scope: **server**`,
        `Rename tag: **${state.rename_enabled ? 'on' : 'off'}**`,
        reason ? `Reason: ${reason}` : 'Reason: none'
      ].join('\n')
    });
  }
};
