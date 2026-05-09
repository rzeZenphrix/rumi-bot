const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');

const DISCORD_EPOCH = 1420070400000n;

function snowflakeToTimestamp(id) {
  try {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH) / 1000;
  } catch {
    return null;
  }
}

function formatTimestamp(ts) {
  return [
    `**Short time:** <t:${ts}:t>`,
    `**Long time:** <t:${ts}:T>`,
    `**Short date:** <t:${ts}:d>`,
    `**Long date:** <t:${ts}:D>`,
    `**Full:** <t:${ts}:F>`,
    `**Relative:** <t:${ts}:R>`
  ].join('\n');
}

module.exports = {
  name: 'time',
  aliases: [],
  category: 'utility',
  description: 'Build Discord timestamps from now, unix values, dates, or snowflakes.',
  usage: 'time [now|unix <ts>|parse <date>|snowflake <id>]',
  examples: ['time', 'time unix 1760000000', 'time parse 2026-05-01 18:00 UTC', 'time snowflake 123456789012345678'],

  async execute({ message, args }) {
    const sub = String(args[0] || 'now').toLowerCase();
    let ts = Math.floor(Date.now() / 1000);

    if (sub === 'unix') {
      ts = Number(args[1] || 0);
      if (!Number.isFinite(ts) || ts <= 0) return respond.reply(message, 'bad', 'I need a valid unix timestamp.');
    } else if (sub === 'parse') {
      const parsed = Date.parse(args.slice(1).join(' '));
      if (!Number.isFinite(parsed)) return respond.reply(message, 'bad', 'I could not parse that date or time.');
      ts = Math.floor(parsed / 1000);
    } else if (sub === 'snowflake') {
      const id = extractId(args[1]) || args[1];
      ts = snowflakeToTimestamp(id);
      if (!ts) return respond.reply(message, 'bad', 'I need a valid Discord snowflake.');
      ts = Math.floor(ts);
    } else if (/^\d+$/.test(sub)) {
      ts = Number(sub);
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Timestamp',
      allowTitle: true,
      description: formatTimestamp(ts),
      footer: {
        text: `Raw: <t:${ts}:F>`
      }
    });
  }
};
