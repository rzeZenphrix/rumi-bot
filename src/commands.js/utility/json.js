const respond = require('../../utils/respond');

module.exports = {
  name: 'json',
  aliases: ['jsonfmt'],
  category: 'utility',
  description: 'I validate or format JSON.',
  usage: 'json <validate|format> <json>',
  examples: ['json validate {"ok":true}', 'json format {"ok":true}'],

  async execute({ message, args }) {
    const sub = (args.shift() || 'validate').toLowerCase();
    const input = args.join(' ').trim();
    if (!input) return respond.reply(message, 'info', 'Paste JSON after the command.');
    try {
      const parsed = JSON.parse(input);
      if (sub === 'format') {
        const formatted = JSON.stringify(parsed, null, 2).slice(0, 1900);
        return respond.reply(message, 'good', `I formatted that JSON:\n\`\`\`json\n${formatted}\n\`\`\``);
      }
      return respond.reply(message, 'good', 'I validated that JSON successfully.');
    } catch (error) {
      return respond.reply(message, 'bad', `I found invalid JSON: ${error.message}.`);
    }
  }
};
