const respond = require('../../utils/respond');

function normalizeDomain(input) {
  const clean = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(clean) ? clean : null;
}

async function fetchDnsRecord(domain, type) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
  return fetch(url, {
    headers: { Accept: 'application/dns-json' }
  }).then((res) => res.json()).catch(() => null);
}

module.exports = {
  name: 'domain',
  aliases: ['dns'],
  category: 'utility',
  description: 'Look up domain DNS and registration summary info.',
  usage: 'domain <domain>',
  examples: ['domain rumi.rocks', 'domain discord.com'],
  typing: true,

  async execute({ message, args }) {
    const domain = normalizeDomain(args.join(' '));
    if (!domain) {
      return respond.reply(message, 'info', 'Use `domain <domain>` with a valid domain name.');
    }

    const [a, mx, ns, rdap] = await Promise.all([
      fetchDnsRecord(domain, 'A'),
      fetchDnsRecord(domain, 'MX'),
      fetchDnsRecord(domain, 'NS'),
      fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`).then((res) => res.json()).catch(() => null)
    ]);

    const aRecords = (a?.Answer || []).slice(0, 3).map((item) => item.data).join(', ') || 'None';
    const mxRecords = (mx?.Answer || []).slice(0, 3).map((item) => item.data).join(', ') || 'None';
    const nsRecords = (ns?.Answer || []).slice(0, 3).map((item) => item.data).join(', ') || 'None';

    const registrar = rdap?.entities?.find((entity) => (entity.roles || []).includes('registrar'));
    const registrarName = registrar?.vcardArray?.[1]?.find((item) => item[0] === 'fn')?.[3] || 'Unknown';
    const createdAt = rdap?.events?.find((event) => event.eventAction === 'registration')?.eventDate;

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `Domain lookup: ${domain}`,
      description: [
        `**Registrar:** ${registrarName}`,
        `**Registered:** ${createdAt ? `<t:${Math.floor(new Date(createdAt).getTime() / 1000)}:F>` : 'Unknown'}`,
        `**A:** \`${aRecords}\``,
        `**MX:** \`${mxRecords}\``,
        `**NS:** \`${nsRecords}\``
      ].join('\n')
    });
  }
};
