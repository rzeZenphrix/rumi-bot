const respond = require('../../utils/respond');

async function followRedirects(url, limit = 8) {
  const chain = [];
  let current = url;

  for (let step = 0; step < limit; step += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': 'RumiBot/0.2'
      }
    }).catch(() => null);

    if (!response) return { chain, finalUrl: current, finalStatus: null };

    chain.push({
      url: current,
      status: response.status
    });

    const location = response.headers.get('location');
    if (!location || (response.status < 300 || response.status >= 400)) {
      return {
        chain,
        finalUrl: current,
        finalStatus: response.status
      };
    }

    current = new URL(location, current).toString();
  }

  return {
    chain,
    finalUrl: current,
    finalStatus: 'limit'
  };
}

module.exports = {
  name: 'expandurl',
  aliases: ['unshorten'],
  category: 'utility',
  description: 'Expand a shortened URL and show the redirect chain.',
  usage: 'expandurl <url>',
  examples: ['expandurl https://bit.ly/example'],
  typing: true,

  async execute({ message, args }) {
    const raw = args[0];
    if (!raw) return respond.reply(message, 'info', 'Use `expandurl <url>`.');

    let url;
    try {
      url = new URL(raw).toString();
    } catch {
      return respond.reply(message, 'bad', 'I need a valid URL to expand.');
    }

    const result = await followRedirects(url);
    if (!result.chain.length) {
      return respond.reply(message, 'bad', 'I could not expand that URL.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Expanded URL',
      allowTitle: true,
      description: `**Final URL:** ${result.finalUrl}`,
      fields: [
        {
          name: 'Redirect chain',
          value: result.chain
            .map((entry, index) => `**${index + 1}.** \`${entry.status}\` ${entry.url}`)
            .join('\n')
            .slice(0, 1024),
          inline: false
        },
        {
          name: 'Result',
          value: result.finalStatus === 'limit'
            ? 'Stopped after too many redirects.'
            : `Final status: \`${result.finalStatus}\``,
          inline: false
        }
      ]
    });
  }
};
