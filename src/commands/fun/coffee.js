const respond = require('../../utils/respond');
const { getBeverageState, sip, SIP_COOLDOWN_MS } = require('../../systems/fun/beverageStore');

function formatCooldown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

module.exports = {
  name: 'coffee',
  aliases: ['brew'],
  category: 'fun',
  description: 'Sip coffee once, with persistent totals.',
  usage: 'coffee [total]',
  examples: ['coffee', 'coffee total'],
  cooldown: 0,

  async execute({ message, args }) {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'total' || sub === 'stats') {
      const state = await getBeverageState(message.author.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: `${message.author} has sipped coffee **${state.coffee?.total || 0}** time(s).`
      });
    }

    const result = await sip(message.author.id, 'coffee');
    if (!result.ok) {
      return respond.reply(message, 'bad', `You already had coffee recently. Try again in **${formatCooldown(result.retryAfterMs || SIP_COOLDOWN_MS)}**.`);
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `${message.author} sips coffee once. Total coffee count: **${result.total}**.`
    });
  }
};
