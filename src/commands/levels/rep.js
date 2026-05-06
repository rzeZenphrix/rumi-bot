const respond = require('../../utils/respond');
const db = require('../../services/database');
const { resolveUser } = require('../../utils/resolveUser');
const { getProfile } = require('../../systems/social/store');

module.exports = {
  name: 'rep',
  aliases: ['reputation'],
  category: 'levels',
  description: 'Give, remove, or show reputation.',
  usage: 'rep <give|remove|leaderboard> [user]',
  examples: ['rep give @user', 'rep remove @user', 'rep leaderboard'],
  guildOnly: true,

  async execute({ client, message, args }) {
    const sub = String(args.shift() || 'view').toLowerCase();
    const namespace = `guild:${message.guild.id}:rep`;

    if (sub === 'leaderboard') {
      const rows = await db.listKv(namespace, 25);
      rows.sort((a, b) => (b.value.rep || 0) - (a.value.rep || 0));

      const visible = [];
      for (const row of rows) {
        const profile = await getProfile(row.key).catch(() => ({ hideLeaderboard: false }));
        if (profile?.hideLeaderboard) continue;
        visible.push(row);
        if (visible.length >= 10) break;
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          'Star **Rep leaderboard**',
          visible.length
            ? visible.map((row, index) => `**${index + 1}.** <@${row.key}> - \`${row.value.rep || 0}\``).join('\n')
            : 'No visible reputation entries yet.'
        ].join('\n')
      });
    }

    const user = args[0] ? await resolveUser(client, args[0]) : message.author;
    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    const data = await db.getKv(namespace, user.id, { rep: 0 });

    if (sub === 'give') {
      if (user.id === message.author.id) {
        return respond.reply(message, 'bad', 'I cannot let you give reputation to yourself.');
      }

      data.rep = Number(data.rep || 0) + 1;
      await db.setKv(namespace, user.id, data);
      return respond.reply(message, 'good', `Gave ${user} one reputation point.`);
    }

    if (sub === 'remove') {
      data.rep = Math.max(0, Number(data.rep || 0) - 1);
      await db.setKv(namespace, user.id, data);
      return respond.reply(message, 'good', `Removed one reputation point from ${user}.`);
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Star **Reputation**\n${user} has \`${data.rep || 0}\` reputation.`
    });
  }
};
