function getOwnerIds() {
  return String(process.env.BOT_OWNER_IDS || process.env.BOT_OWNER_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isBotOwner(userId) {
  return getOwnerIds().includes(String(userId));
}

module.exports = {
  getOwnerIds,
  isBotOwner
};