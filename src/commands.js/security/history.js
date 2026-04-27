const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { requireServerPremium } = require('../../systems/monetization/access');
const { resolveUser } = require('../../utils/resolveUser');

async function resolveTarget(client, token) {
  if (!token) return null;
  return resolveUser(client, token);
}

module.exports = {
  name: 'history',
  aliases: ['risk', 'flags'],
  category: 'security',
  description: 'Show or manage recent cross-server flags for a user.',
  usage: 'history <@user|userId> | history <pardon|clear> <@user|userId>',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ client, message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'pardon' || sub === 'clear') {
      const access = await requireServerPremium(message, 'History moderation').catch(() => null);
      if (!access) return null;

      const user = await resolveTarget(client, args[1]);
      if (!user) {
        return respond.reply(message, 'bad', 'I could not find that user.');
      }

      if (sub === 'pardon') {
        const rows = await db.pardonUserFlags(user.id, message.guild.id).catch(() => null);
        if (!rows) {
          return respond.reply(message, 'bad', 'I could not pardon those flags right now.');
        }
        return respond.reply(message, 'good', `Marked **${rows.length}** flag(s) as resolved for **${user.tag}** in this server.`);
      }

      const confirm = String(args[2] || '').toLowerCase();
      if (confirm !== 'confirm') {
        return respond.reply(message, 'alert', 'Use `history clear <@user|userId> confirm` to permanently delete this server\'s flags for that user.');
      }

      const rows = await db.deleteUserFlags(user.id, message.guild.id).catch(() => null);
      if (!rows) {
        return respond.reply(message, 'bad', 'I could not delete those flags right now.');
      }

      return respond.reply(message, 'good', `Deleted **${rows.length}** flag(s) for **${user.tag}** in this server.`);
    }

    const target = args.shift();
    if (!target) {
      return respond.reply(message, 'info', 'Usage: `history <@user|userId>`, `history pardon <@user|userId>`, or `history clear <@user|userId> confirm`.');
    }

    const user = await resolveTarget(client, target);
    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    const flags = await db.getUserFlags(user.id, { limit: 10 }).catch(() => []);
    const profile = await db.getUser(user.id).catch(() => null);

    if (!flags.length) {
      return respond.reply(message, 'info', `${user.tag} has no stored flags.`);
    }

    const lines = flags.map((flag) => {
      return `- ${flag.type} | ${flag.confidence}/100 | guild ${flag.guild_id} | resolved: ${flag.resolved ? 'yes' : 'no'} | ${new Date(flag.created_at).toLocaleString()}`;
    });

    return respond.reply(
      message,
      'list',
      `Risk score: ${profile?.global_risk_score ?? 0}/100\n${lines.join('\n')}`,
      { user }
    );
  }
};
