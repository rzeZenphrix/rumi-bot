module.exports = {
  name: 'claim',
  aliases: [],
  category: 'tickets',
  description: 'Claim the current ticket.',
  usage: 'claim',
  examples: ['claim'],
  guildOnly: true,

  async execute(ctx) {
    const ticket = require('./ticket');
    ctx.args = ['claim'];
    return ticket.execute(ctx);
  }
};
