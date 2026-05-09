const ce = require('../misc/ce');
const respond = require('../../utils/respond');

module.exports = {
  ...ce,
  name: 'embed',
  aliases: ['embeds'],
  description: 'Embed builder and embed script command.',
  usage: 'embed <preview|send> ...',

  async execute(context) {
    const sub = String(context.args[0] || '').toLowerCase();

    if (!context.args.length || sub === 'builder') {
      return respond.reply(context.message, 'info', null, {
        title: 'Embed builder syntax',
        allowTitle: true,
        description: [
          '**Embed builder syntax**',
          '`embed preview {embed}$v{description: hello}`',
          '`embed send #channel {embed}$v{title: Title}$v{description: Text}$v{image: https://...}`',
          '',
          '**Supported blocks**',
          '`color`, `title`, `url`, `description`, `thumbnail`, `image`, `gif`, `timestamp`, `author`, `footer`, `field`, `button`',
          '',
          '**Field syntax**',
          '`$v{field: Name && Value && true}`',
          '',
          '**Button syntax**',
          '`$v{button: https://example.com && Open Site && link}`'
        ].join('\n')
      });
    }

    return ce.execute(context);
  }
};
