const ce = require('./ce');

module.exports = {
  ...ce,
  name: 'embed',
  aliases: ['embeds'],
  description: 'Opens the embed builder help or previews/sends an embed script.',
  usage: 'embed [preview|send] ...',

  async execute(context) {
    const sub = String(context.args[0] || '').toLowerCase();

    if (!context.args.length || sub === 'builder') {
      return context.message.channel.send({
        content: [
          '**Embed builder**',
          '`embed send #channel {embed}$v{description: hello}`',
          '`ce {embed}$v{description: Choose below}$v{button: Open Support && 🎫 && primary && action=create_ticket:support}`',
          '',
          '**Ticket dropdown**',
          '`$v{dropdown: Choose a ticket type && support:Support:General help && bug:Bug Report:Report an issue}``',
          '',
          '**Blocks**',
          '`color`, `title`, `url`, `description`, `thumbnail`, `image`, `gif`, `timestamp`, `author`, `footer`, `field`, `button`, `dropdown`'
        ].join('\n'),
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'preview') context.args.shift();

    return ce.execute(context);
  }
};
