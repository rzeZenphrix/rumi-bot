const respond = require('../../utils/respond');

module.exports = {
  name: 'vibe',
  aliases: ["vibecheck"],
  category: 'fun',
  description: "Checks the vibe.",
  usage: "vibe",
  examples: ["vibe"],

  async execute({ message, args }) {
    const score = Math.floor(Math.random() * 101);
    const label = score > 75 ? 'immaculate' : score > 45 ? 'stable' : 'questionable';
    return respond.reply(message, 'info', `checked the vibe: **${score}%** — **${label}**.`);
  }
};
