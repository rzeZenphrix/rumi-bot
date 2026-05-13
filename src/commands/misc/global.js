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
      return respond.reply(message, '> Be marked as afk in all mutual servers.\n```Syntax: global afk [reason] or global afk rename [reason]```', {
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
    const mutualServerChecks = message.client.guilds.cache.map(async (guild) => {
      if (guild.members.cache.has(message.author.id)) return true;
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      return Boolean(member);
    });
    const mutualServerCount = (await Promise.all(mutualServerChecks)).filter(Boolean).length;
    const statusSuffix = reason ? ` with the status: **${reason}**` : '';
    return respond.reply(message, 'up', null, {
      mentionUser: false,
      description: [
        `You're now afk in **${mutualServerCount}** servers${statusSuffix}`,
      ].join('\n')
    });
  }
};
