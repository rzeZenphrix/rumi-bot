const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { parseEmbedScript } = require('../../systems/embed/embedParser');

function resolveChannel(message, value) {
  const id = String(value || '').match(/\d{17,20}/)?.[0];
  if (!id) return null;
  return message.guild.channels.cache.get(id) || null;
}

module.exports = {
  name: 'ce',
  aliases: ['embedcreate'],
  category: 'embeds',
  description: 'Previews or sends an advanced embed script with ticket actions.',
  usage: 'ce [send #channel] {embed}$v{description: text}$v{button: Open && 🎫 && primary && action=create_ticket:support}',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],

  async execute({ client, message, args, prefix }) {
    let action = 'preview';

    if (String(args[0] || '').toLowerCase() === 'send') {
      action = 'send';
      args.shift();
    }

    let channel = message.channel;

    if (action === 'send') {
      const maybeChannel = resolveChannel(message, args[0]);

      if (maybeChannel) {
        channel = maybeChannel;
        args.shift();
      }
    }

    const script = args.join(' ').trim();

    if (!script) {
      return respond.reply(
        message,
        'info',
        `Use \`${prefix}ce {embed}$v{description: hello}\` or \`${prefix}ce send #channel {embed}$v{description: hello}\`.`
      );
    }

    const output = await parseEmbedScript(script, {
      client,
      message,
      args,
      prefix
    });

    if (action === 'send') {
      await channel.send({
        embeds: output.embeds,
        components: output.components,
        allowedMentions: { parse: [] }
      });

      return respond.reply(message, 'good', `Embed sent to ${channel}.`);
    }

    return message.channel.send({
      embeds: output.embeds,
      components: output.components,
      allowedMentions: { parse: [] }
    });
  }
};
