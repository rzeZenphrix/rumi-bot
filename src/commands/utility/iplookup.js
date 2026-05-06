const respond = require('../../utils/respond');
const { requireUserPremium } = require('../../systems/monetization/access');

function normalizeInput(value) {
  return String(value || '').trim().replace(/^\[|\]$/g, '');
}

function looksLikeIp(value) {
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[a-f0-9:]+$/i;
  return ipv4.test(value) || ipv6.test(value);
}

module.exports = {
  name: 'iplookup',
  aliases: ['ip'],
  category: 'utility',
  description: 'Look up public IP location and ASN information.',
  usage: 'iplookup <ip>',
  examples: ['iplookup 1.1.1.1', 'ip 8.8.8.8'],

  async execute({ message, args }) {
    const access = await requireUserPremium(message, 'IP lookup').catch(() => null);
    if (!access) return null;

    const query = normalizeInput(args[0]);
    if (!query || !looksLikeIp(query)) {
      return respond.reply(message, 'info', 'Use `iplookup <public ip>`.');
    }

    const payload = await fetch(`https://ipwho.is/${encodeURIComponent(query)}`).then((res) => res.json()).catch(() => null);
    if (!payload?.success) {
      return respond.reply(message, 'bad', payload?.message || 'I could not look up that IP right now.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        `**IP:** \`${payload.ip}\``,
        `**Country:** ${payload.country || 'Unknown'} (${payload.country_code || '??'})`,
        `**Region:** ${payload.region || 'Unknown'}`,
        `**City:** ${payload.city || 'Unknown'}`,
        `**ISP:** ${payload.connection?.isp || 'Unknown'}`,
        `**ASN:** \`${payload.connection?.asn || 'Unknown'}\``,
        `**Timezone:** ${payload.timezone?.id || 'Unknown'}`
      ].join('\n')
    });
  }
};
