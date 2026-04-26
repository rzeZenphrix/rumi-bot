const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
  name: 'whitelist',
  aliases: ['wl'],
  category: 'security',
  description: 'Manage trusted users who are ignored by security punishment systems.',
  usage: 'whitelist <add|remove|list|check> [@user|userId] [reason]',
  examples: [
    'whitelist add @admin trusted owner',
    'whitelist remove @user',
    'whitelist list',
    'whitelist check @user'
  ],
  subcommands: [
    {
      name: 'add',
      aliases: ['trust'],
      usage: 'whitelist add <@user|userId> [reason]',
      description: 'Trust a user.'
    },
    {
      name: 'remove',
      aliases: ['delete', 'del', 'rm'],
      usage: 'whitelist remove <@user|userId>',
      description: 'Remove a trusted user.'
    },
    {
      name: 'list',
      aliases: ['ls'],
      usage: 'whitelist list',
      description: 'Show trusted users.'
    },
    {
      name: 'check',
      aliases: ['has', 'info'],
      usage: 'whitelist check <@user|userId>',
      description: 'Check whether a user is trusted.'
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ client, message, args }) {
    const subcommand = (args.shift() || '').toLowerCase();

    if (!subcommand) {
      return respond.reply(message, 'info', 'I use it like this: `whitelist <add|remove|list|check> [@user|userId] [reason]`.');
    }

    if (subcommand === 'list') {
      const rows = await db.listWhitelist(message.guild.id, 25);

      if (!rows.length) {
        return respond.reply(message, 'info', 'No users are whitelisted in this server yet.');
      }

      const lines = rows.map((row, index) => {
        return `**${index + 1}.** <@${row.user_id}> — ${row.reason || 'No reason'} — added by ${row.added_by ? `<@${row.added_by}>` : 'unknown'}`;
      });

      return respond.reply(message, 'list', `trusted users:\n\n${lines.join('\n')}`);
    }

    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', `I use it like this: \`whitelist ${subcommand} <@user|userId>\`.`);
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    if (subcommand === 'add') {
      const reason = args.join(' ') || 'Trusted by server staff';

      await db.addWhitelist(message.guild.id, user.id, reason, message.author.id);

      return respond.reply(message, 'good', `I whitelisted ${user}. Reason: ${reason}`);
    }

    if (['remove', 'delete', 'del'].includes(subcommand)) {
      await db.removeWhitelist(message.guild.id, user.id);

      return respond.reply(message, 'good', `I removed ${user} from the whitelist.`);
    }

    if (subcommand === 'check') {
      const trusted = await db.isWhitelisted(message.guild.id, user.id);

      return respond.reply(
        message,
        trusted ? 'good' : 'info',
        trusted ? `${user} is whitelisted.` : `${user} is not whitelisted.`
      );
    }

    return respond.reply(message, 'bad', `Unknown whitelist subcommand \`${subcommand}\`.`);
  }
};