const respond = require('../../utils/respond');
const db = require('../../services/database');

async function pingUrl(name, url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', headers });
    return { name, ok: res.ok, status: res.status, latencyMs: Date.now() - started };
  } catch (error) {
    return { name, ok: false, status: 'ERR', latencyMs: Date.now() - started, error: error.message };
  }
}

module.exports = {
  name: 'api',
  aliases: ['apistatus', 'diagnostics', 'diag'],
  category: 'utility',
  description: 'I check database and external API status/latency.',
  usage: 'api <status|latency>',
  examples: ['api status', 'api latency'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'status').toLowerCase();
    const checks = [];

    const dbCheck = await db.dbHealthCheck().catch((error) => ({ ok: false, latencyMs: 0, error: error.message }));
    checks.push({ name: 'Supabase', ...dbCheck });

    if (process.env.GOOGLE_API_KEY || process.env.google) {
      checks.push(await pingUrl('Google/Tenor API', 'https://tenor.googleapis.com/v2/featured?key=' + encodeURIComponent(process.env.GOOGLE_API_KEY || process.env.google) + '&limit=1&client_key=rumi-bot'));
    } else {
      checks.push({ name: 'Google/Tenor API', ok: false, status: 'NO_KEY', latencyMs: 0, error: 'Missing GOOGLE_API_KEY' });
    }

    if (process.env.GEMINI_API_KEY || process.env.gemini) {
      checks.push({ name: 'Gemini API', ok: true, status: 'KEY_SET', latencyMs: 0 });
    } else {
      checks.push({ name: 'Gemini API', ok: false, status: 'NO_KEY', latencyMs: 0, error: 'Missing GEMINI_API_KEY' });
    }

    const lines = checks.map((c) => `${c.ok ? '✅' : '❌'} **${c.name}** — ${c.status || (c.ok ? 'OK' : 'ERR')} ${c.latencyMs ? `(${c.latencyMs}ms)` : ''}${c.error ? `\n↳ ${c.error}` : ''}`);
    const title = sub === 'latency' ? 'API latency' : 'API status';

    return respond.reply(message, 'info', null, { title, description: `I checked the configured services.\n\n${lines.join('\n')}` });
  }
};
