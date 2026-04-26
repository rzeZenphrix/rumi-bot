function extractId(input) {
  if (!input) return null;

  const mentionMatch = input.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) return mentionMatch[1];

  const rawIdMatch = input.match(/^(\d{17,20})$/);
  if (rawIdMatch) return rawIdMatch[1];

  return null;
}

async function resolveMember(guild, input) {
  const id = extractId(input);

  if (!id) return null;

  return guild.members.fetch(id).catch(() => null);
}

async function resolveUser(client, input) {
  const id = extractId(input);

  if (!id) return null;

  return client.users.fetch(id).catch(() => null);
}

module.exports = {
  extractId,
  resolveMember,
  resolveUser
};