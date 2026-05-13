const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const inviteTracker = require('../../systems/invites/inviteTracker');

function timestamp(value) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

module.exports = {
  name: 'inviter',
  aliases: ['whoinvited', 'invitedby'],
  category: 'invites',
  description: 'Show who invited a member.',
  usage: 'inviter [@user|userId]',
  examples: ['inviter @user', 'whoinvited 123456789012345678'],
  guildOnly: true,

  async execute({ client, message, args }) {
    const user = args[0]
      ? await resolveUser(client, args[0]).catch(() => null)
      : message.author;

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.', {
        allowedMentions: { parse: [] }
      });
    }

    const row = await inviteTracker.getInviter(message.guild.id, user.id);

    if (!row) {
      return respond.reply(message, 'info', `I have no invite record for **${user.tag || user.username}**.`, {
        allowedMentions: { parse: [] }
      });
    }

    const sourceLine = row.source === 'invite'
      ? `Invite: \`${row.invite_code || 'unknown'}\``
      : row.source === 'vanity'
        ? 'Source: server vanity invite'
        : 'Source: unknown';

    const inviterLine = row.inviter_id
      ? `Inviter: <@${row.inviter_id}>`
      : 'Inviter: unknown';

    return respond.reply(
      message,
      'info',
      [
        `Invite record for **${user.tag || user.username}**`,
        inviterLine,
        sourceLine,
        `Joined: ${timestamp(row.joined_at)}`,
        row.left_at ? `Left: ${timestamp(row.left_at)}` : 'Status: still in server or not marked left'
      ].join('\n'),
      { allowedMentions: { parse: [] } }
    );
  }
};