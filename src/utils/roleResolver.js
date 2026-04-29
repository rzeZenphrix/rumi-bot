const { extractId } = require('./resolveUser');

async function findRole(guild, input) {
  if (!guild || !input) return null;

  const raw = String(input || '').trim();
  const mentionId = raw.match(/^<@&(\d{17,20})>$/)?.[1];
  const roleId = mentionId || extractId(raw);

  if (roleId) {
    return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
  }

  const query = raw.toLowerCase();
  return (
    guild.roles.cache.find((role) => {
      const name = role.name?.toLowerCase?.() || '';
      return name === query || name.includes(query);
    }) ||
    null
  );
}

module.exports = {
  findRole
};
