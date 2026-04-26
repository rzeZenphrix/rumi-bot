const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { unjailMember } = require('../../systems/jail/jailManager');
const { resolveMember } = require('../../utils/resolveUser');

module.exports = {
  name: 'unjail',
  aliases: ['release'],
  description: 'Release a member from quarantine.',
  usage: 'unjail <@user|userId> [reason]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'I use it like this: `unjail <@user|userId> [reason]`.');
    }

    const member = await resolveMember(message.guild, target);

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    const reason = args.join(' ') || 'Manual quarantine release';

    const result = await unjailMember({
      guild: message.guild,
      member,
      reason,
      actorId: message.author.id
    });

    if (!result.ok) {
      return respond.reply(message, 'bad', `I could not unjail ${member}: ${result.reason}.`);
    }

    return respond.reply(message, 'good', `I released ${member} from jail.`);
  }
};
