function parseOwnerIds(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id || '').trim()).filter(Boolean);
      }
    } catch {}
  }

  return raw
    .split(/[\s,;|]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function getOwnerIds() {
  const values = [
    process.env.BOT_OWNER_IDS,
    process.env.BOT_OWNER_ID,
    process.env.OWNER_IDS,
    process.env.OWNER_ID,
    process.env.DISCORD_OWNER_IDS,
    process.env.DISCORD_OWNER_ID,
    process.env.RUMI_OWNER_IDS,
    process.env.RUMI_OWNER_ID
  ];

  return [...new Set(values.flatMap(parseOwnerIds))];
}

function isBotOwner(userId) {
  return getOwnerIds().includes(String(userId));
}

module.exports = {
  getOwnerIds,
  isBotOwner
};
