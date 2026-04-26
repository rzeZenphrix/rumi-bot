const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
  name: 'history',
  aliases: ['risk', 'flags'],
  category: 'security',
  description: 'Show recent cross-server flags for a user.',
  usage: 'history <@user|userId>',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ client, message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'Usage: `history <@user|userId>`.');
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    const flags = await db.getUserFlags(user.id, { limit: 10 });
    const profile = await db.getUser(user.id);

    if (!flags.length) {
      return respond.reply(message, 'info', `${user.tag} has no stored flags.`);
    }

    const lines = flags.map((flag) => {
      return `• ${flag.type} | ${flag.confidence}/100 | guild ${flag.guild_id} | ${new Date(flag.created_at).toLocaleString()}`;
    });

    return respond.reply(
      message,
      'list',
      `Risk score: ${profile?.global_risk_score ?? 0}/100\n${lines.join('\n')}`,
      { user }
    );
  }
};
