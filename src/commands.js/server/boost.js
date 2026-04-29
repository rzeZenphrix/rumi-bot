const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { findRole } = require('../../utils/roleResolver');
const { addBoostRewardRole, removeBoostRewardRole, listBoostRewardRoles } = require('../../systems/boosterroles/store');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

module.exports = {
  name: 'boost',
  aliases: ['booster'],
  category: 'server',
  description: 'Manage boost rewards for members who boost the server.',
  usage: 'boost reward <set|view|remove> [role]',
  examples: ['boost reward set @Server Booster', 'boost reward view', 'boost reward remove @Server Booster'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  subcommands: [
    {
      name: 'reward',
      description: 'Set, view, or remove booster reward roles.',
      usage: 'boost reward <set|view|remove> [role]',
      examples: ['boost reward set @Booster']
    }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || '').toLowerCase();
    if (sub !== 'reward') {
      return respond.reply(message, 'info', 'Use `boost reward <set|view|remove> [role]`.', { mentionUser: false });
    }

    const action = String(args.shift() || 'view').toLowerCase();
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const limit = access?.hasServerPremiumBase ? 15 : 5;

    if (action === 'view' || action === 'list') {
      const rewards = await listBoostRewardRoles(message.guild.id).catch(() => []);
      const description = rewards.length
        ? rewards
            .map((entry, index) => `**${index + 1}.** <@&${entry.role_id}>`)
            .join('\n')
        : 'No boost reward roles are configured yet.';
      return respond.reply(message, 'info', null, {
        title: 'Boost rewards',
        allowTitle: true,
        mentionUser: false,
        description: `**Configured:** ${rewards.length}/${limit}\n\n${description}`
      });
    }

    const role = await findRole(message.guild, args.join(' '));
    if (!role) {
      return respond.reply(message, 'info', 'Use `boost reward set <role>` or `boost reward remove <role>`.', {
        mentionUser: false
      });
    }

    if (action === 'set' || action === 'add') {
      const rewards = await listBoostRewardRoles(message.guild.id).catch(() => []);
      if (!rewards.some((entry) => entry.role_id === role.id) && rewards.length >= limit) {
        return respond.reply(
          message,
          'bad',
          access?.hasServerPremiumBase
            ? `You already used all ${limit} boost reward slots.`
            : 'Free servers can configure up to 5 boost rewards. Server premium raises that to 15.'
        );
      }

      await addBoostRewardRole(message.guild.id, role.id, message.author.id);
      return respond.reply(message, 'good', `Added ${role} to the boost reward list.`);
    }

    if (action === 'remove' || action === 'delete') {
      await removeBoostRewardRole(message.guild.id, role.id).catch(() => null);
      return respond.reply(message, 'good', `Removed ${role} from the boost reward list.`);
    }

    return respond.reply(message, 'info', 'Use `boost reward <set|view|remove> [role]`.', { mentionUser: false });
  }
};
