module.exports = {
  name: 'close',
  aliases: [],
  category: 'tickets',
  description: 'Close the current ticket.',
  usage: 'close [reason]',
  examples: ['close issue resolved'],
  guildOnly: true,

  async execute(ctx) {
    const ticket = require('./ticket');
    ctx.args = ['close', ...(ctx.args || [])];
    return ticket.execute(ctx);
  }
};
