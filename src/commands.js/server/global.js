const respond = require('../../utils/respond');
const { setAfk, requireAfkRenamePremium } = require('../../systems/afk/manager');

module.exports = {
  name: 'global',
  aliases: [],
  category: 'server',
  description: 'Global account actions that apply across mutual servers.',
  usage: 'global afk [reason] | global afk rename [reason]',
  examples: ['global afk at work', 'global afk rename travelling'],
  guildOnly: true,
  subcommands: [
    {
      name: 'afk',
      description: 'Set yourself AFK across every mutual server.',
      usage: 'global afk [reason]',
      examples: ['global afk asleep']
    }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || '').toLowerCase();
    if (sub !== 'afk') {
      return respond.reply(message, 'info', 'Use `global afk [reason]` or `global afk rename [reason]`.', {
        mentionUser: false
      });
    }

    const wantsRename = String(args[0] || '').toLowerCase() === 'rename';
    if (wantsRename) {
      const premium = await requireAfkRenamePremium(message);
      if (!premium) return null;
      args.shift();
    }

    const reason = args.join(' ').trim();
    const state = await setAfk(message.member, 'global', reason, wantsRename);
    return respond.reply(message, 'good', null, {
      mentionUser: false,
      title: 'Global AFK enabled',
      allowTitle: true,
      description: [
        `Scope: **global**`,
        `Rename tag: **${state.rename_enabled ? 'on' : 'off'}**`,
        reason ? `Reason: ${reason}` : 'Reason: none'
      ].join('\n')
    });
  }
};
