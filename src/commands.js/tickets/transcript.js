module.exports = {
  name: 'transcript',
  aliases: ['tickettranscript'],
  category: 'tickets',
  description: 'Generate a transcript for the current ticket.',
  usage: '',
  examples: ['transcript'],
  guildOnly: true,

  async execute(ctx) {
    const ticket = require('./ticket');
    ctx.args = ['transcript'];
    return ticket.execute(ctx);
  }
};