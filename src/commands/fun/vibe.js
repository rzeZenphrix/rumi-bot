const respond = require('../../utils/respond');

module.exports = {
  name: 'vibecheck',
  aliases: ['checkvibe'],
  category: 'fun',
  description: "Checks the vibe.",
  usage: 'vibecheck',
  examples: ['vibecheck'],

  async execute({ message, args }) {
    const score = Math.floor(Math.random() * 101);
    const label = score > 75 ? 'immaculate' : score > 45 ? 'stable' : 'questionable';
    return respond.reply(message, 'info', `checked the vibe: **${score}%** — **${label}**.`);
  }
};
