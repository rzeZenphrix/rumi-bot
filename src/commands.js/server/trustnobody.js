const respond = require('../../utils/respond');
const { requireServerPremium } = require('../../systems/monetization/access');
const { getTrustNobodySettings, saveTrustNobodySettings } = require('../../systems/security/trustNobody');

module.exports = {
  name: 'trustnobody',
  aliases: ['tnobody'],
  category: 'server',
  description: 'Owner-only anti-nuke override that still watches trusted staff.',
  usage: 'trustnobody <on|off|status>',
  examples: ['trustnobody on', 'trustnobody off', 'trustnobody status'],
  guildOnly: true,

  async execute({ message, args }) {
    if (message.author.id !== message.guild.ownerId) {
      return respond.reply(message, 'bad', 'Only the server owner can use that command.');
    }

    const premium = await requireServerPremium(message, 'Trust nobody');
    if (!premium) return null;

    const action = String(args.shift() || 'status').toLowerCase();
    if (action === 'status' || action === 'view') {
      const settings = await getTrustNobodySettings(message.guild.id);
      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Trust Nobody',
        mentionUser: false,
        description: settings.enabled
          ? 'Enabled. Trusted and whitelisted staff are still monitored, and they only trip enforcement if they exceed the anti-nuke threshold by 70%.'
          : 'Disabled. Trusted and whitelisted staff follow the normal bypass behavior.'
      });
    }

    if (!['on', 'off'].includes(action)) {
      return respond.reply(message, 'info', 'Use `trustnobody <on|off|status>`.', { mentionUser: false });
    }

    const enabled = action === 'on';
    await saveTrustNobodySettings(message.guild.id, {
      enabled,
      updated_by: message.author.id,
      activated_at: enabled ? new Date().toISOString() : null
    });

    return respond.reply(
      message,
      'good',
      enabled
        ? 'Trust nobody is now enabled.'
        : 'Trust nobody is now disabled.'
    );
  }
};
