const db = require('../../services/database');
const respond = require('../../utils/respond');
const { normalizePrefix } = require('../../systems/prefix/prefixManager');

module.exports = {
  name: 'selfprefix',
  aliases: ['myprefix', 'sp'],
  description: 'Set or reset your personal command prefix.',
  usage: 'selfprefix set <prefix> | selfprefix reset | selfprefix view',

  async execute({ message, args }) {
    const subcommand = (args[0] || 'view').toLowerCase();

    if (subcommand === 'view') {
      const prefix = await db.getUserPrefix(message.author.id);

      return respond.reply(
        message,
        'info',
        prefix
          ? `I will answer your personal prefix \`${prefix}\`.`
          : 'I do not have a personal prefix saved for you yet.'
      );
    }

    if (subcommand === 'set') {
      const nextPrefix = normalizePrefix(args[1]);

      if (!nextPrefix) {
        return respond.reply(message, 'bad', 'I need a prefix from 1–5 characters with no spaces.');
      }

      await db.setUserPrefix(message.author.id, nextPrefix);

      return respond.reply(message, 'good', `I saved \`${nextPrefix}\` as your personal prefix.`);
    }

    if (subcommand === 'reset') {
      await db.resetUserPrefix(message.author.id);

      return respond.reply(message, 'good', 'I removed your personal prefix.');
    }

    return respond.reply(message, 'info', 'I use it like this: `selfprefix view`, `selfprefix set <prefix>`, or `selfprefix reset`.');
  }
};
