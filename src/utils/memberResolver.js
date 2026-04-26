const { extractId } = require('./resolveUser');

async function findMember(guild, input, fallbackUserId = null) {
  const id = extractId(input) || (!input && fallbackUserId ? fallbackUserId : null);
  if (id) return guild.members.fetch(id).catch(() => null);

  const query = String(input || '').trim().toLowerCase();
  if (!query) return null;

  const cached = guild.members.cache.find((m) => {
    const tag = m.user.tag?.toLowerCase?.() || '';
    const username = m.user.username?.toLowerCase?.() || '';
    const globalName = m.user.globalName?.toLowerCase?.() || '';
    const displayName = m.displayName?.toLowerCase?.() || '';
    return tag === query || username === query || globalName === query || displayName === query;
  });

  if (cached) return cached;

  const found = await guild.members.search({ query: input, limit: 1 }).catch(() => null);
  return found?.first?.() || null;
}

module.exports = { findMember };
