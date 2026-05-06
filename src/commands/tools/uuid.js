const crypto = require('node:crypto');
const respond = require('../../utils/respond');

module.exports = {
  name: 'uuid',
  aliases: ['guid'],
  category: 'tools',
  description: 'Generate one or more random UUIDs.',
  usage: 'uuid [count]',
  examples: ['uuid', 'uuid 5'],

  async execute({ message, args }) {
    const count = Math.min(10, Math.max(1, Number(args[0]) || 1));
    const lines = Array.from({ length: count }, () => `\`${crypto.randomUUID()}\``);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Generated **${count}** UUID${count === 1 ? '' : 's'}.`,
      fields: [{ name: 'Output', value: lines.join('\n') }]
    });
  }
};
