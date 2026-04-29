const respond = require('../../utils/respond');

function randomHex() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

module.exports = {
  name: 'randomhex',
  aliases: ['randhex', 'hexrandom'],
  category: 'tools',
  description: 'Generate a random hex color.',
  usage: 'randomhex',
  examples: ['randomhex'],

  async execute({ message }) {
    const value = randomHex();
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Random Hex',
      allowTitle: true,
      description: `\`${value}\``
    });
  }
};
