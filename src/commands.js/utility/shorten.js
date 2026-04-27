const respond = require('../../utils/respond');

module.exports = {
  name: 'shorten',
  aliases: ['shorturl'],
  category: 'utility',
  description: 'Shorten a URL.',
  usage: 'shorten <url>',

  async execute({ message, args }) {
    const url = args[0];
    if (!url) return respond.reply(message, 'info', 'Use `shorten <url>`.');

    try {
      new URL(url);
    } catch {
      return respond.reply(message, 'bad', 'I need a valid URL.');
    }

    const output = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`)
      .then((res) => res.text())
      .catch(() => null);

    if (!output || !/^https?:\/\//i.test(output)) {
      return respond.reply(message, 'bad', 'The shortener is unavailable right now.');
    }

    return respond.reply(message, 'good', `Short URL: ${output}`);
  }
};
