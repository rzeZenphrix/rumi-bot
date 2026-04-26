const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { jailMember } = require('../../systems/jail/jailManager');
const { resolveMember } = require('../../utils/resolveUser');

module.exports = {
  name: 'jail',
  aliases: ['quarantine'],
  description: 'Quarantine a member.',
  usage: 'jail <@user|userId> [reason]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'I use it like this: `jail <@user|userId> [reason]`.');
    }

    const member = await resolveMember(message.guild, target);

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    const reason = args.join(' ') || 'Manual quarantine';

    const result = await jailMember({
      guild: message.guild,
      member,
      reason,
      actorId: message.author.id,
      metadata: {
        command: 'jail'
      }
    });

    if (!result.ok) {
      return respond.reply(message, 'bad', `I could not jail ${member}: ${result.reason}.`);
    }

    return respond.reply(message, 'good', `I jailed ${member}. Reason: ${reason}`);
  }
};
