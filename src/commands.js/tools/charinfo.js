const respond = require('../../utils/respond');

function summarizeCharacter(char) {
  const codePoint = char.codePointAt(0);
  const hex = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  const bytes = Buffer.from(char).toString('hex').match(/.{1,2}/g)?.join(' ') || 'n/a';
  const safeDisplay = /\s/.test(char) ? JSON.stringify(char) : char;

  return `**${safeDisplay}** • ${hex} • bytes: \`${bytes}\``;
}

module.exports = {
  name: 'charinfo',
  aliases: ['unicode', 'codepoint'],
  category: 'tools',
  description: 'Inspect characters, unicode codepoints, and UTF-8 bytes.',
  usage: 'charinfo <text>',
  examples: ['charinfo A', 'charinfo ✅ test'],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) {
      return respond.reply(message, 'info', 'Use `charinfo <text>`.');
    }

    const chars = Array.from(text).slice(0, 15);
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Showing character info for the first **${chars.length}** character${chars.length === 1 ? '' : 's'}.`,
      fields: [{ name: 'Characters', value: chars.map(summarizeCharacter).join('\n').slice(0, 1024) }]
    });
  }
};
