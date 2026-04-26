const respond = require('../../utils/respond');

module.exports = {
  name: 'timestamp',
  aliases: ["ts"],
  category: 'tools',
  description: "Creates Discord timestamp formats.",
  usage: "timestamp [unix]",
  examples: ["timestamp [unix]"],

  async execute({ message, args }) {
    const unix = Number(args[0]) || Math.floor(Date.now() / 1000);
    return respond.reply(message, 'info', null, {
      description: 'I generated Discord timestamps.',
      fields: [
        { name: 'Short time', value: `<t:${unix}:t>`, inline: true },
        { name: 'Long date', value: `<t:${unix}:F>`, inline: true },
        { name: 'Relative', value: `<t:${unix}:R>`, inline: true },
        { name: 'Raw', value: `\`<t:${unix}:R>\`` }
      ]
    });
  }
};
