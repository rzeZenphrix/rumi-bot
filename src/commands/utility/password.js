const crypto = require('node:crypto');
const respond = require('../../utils/respond');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const NUMBERS = '23456789';
const SYMBOLS = '!@#$%^&*_-+=';
const WORDS = [
  'sakura', 'silver', 'velvet', 'cinder', 'midnight', 'signal', 'orbit', 'honey',
  'violet', 'ember', 'atlas', 'river', 'echo', 'neon', 'pearl', 'fable'
];

function pick(value) {
  return value[crypto.randomInt(value.length)];
}

module.exports = {
  name: 'password',
  aliases: ['pwgen'],
  category: 'utility',
  description: 'Generate a password or passphrase.',
  usage: 'password [length] [--no-symbols] [--no-numbers] [--passphrase] [--words 4]',
  examples: ['password 24', 'password --passphrase --words 5'],

  async execute({ message, args }) {
    const passphrase = args.includes('--passphrase');
    const noSymbols = args.includes('--no-symbols');
    const noNumbers = args.includes('--no-numbers');

    if (passphrase) {
      const wordIndex = args.indexOf('--words');
      const count = Math.max(3, Math.min(8, Number(args[wordIndex + 1]) || 4));
      const words = Array.from({ length: count }, () => pick(WORDS));
      const secret = words.join('-');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Generated passphrase',
        allowTitle: true,
        description: `||${secret}||`,
        fields: [
          { name: 'Words', value: String(count), inline: true },
          { name: 'Style', value: 'Passphrase', inline: true }
        ]
      });
    }

    const explicitLength = args.find((value) => /^\d+$/.test(value));
    const length = Math.max(8, Math.min(64, Number(explicitLength) || 20));
    const pool = [
      LETTERS,
      noNumbers ? '' : NUMBERS,
      noSymbols ? '' : SYMBOLS
    ].join('');

    let output = '';
    for (let index = 0; index < length; index += 1) {
      output += pool[crypto.randomInt(pool.length)];
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Generated password',
      allowTitle: true,
      description: `||${output}||`,
      fields: [
        { name: 'Length', value: String(length), inline: true },
        { name: 'Symbols', value: noSymbols ? 'off' : 'on', inline: true },
        { name: 'Numbers', value: noNumbers ? 'off' : 'on', inline: true }
      ]
    });
  }
};
