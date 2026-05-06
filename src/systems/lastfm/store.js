const musicStore = require('../musicAccounts/store');

function cleanUsername(username = '') {
  return String(username || '').trim().replace(/^@+/, '').slice(0, 64);
}

async function linkUser(discordUserId, username) {
  const cleaned = cleanUsername(username);
  if (!cleaned) return null;

  return musicStore.saveLastFmAccount(discordUserId, {
    username: cleaned,
    display_name: cleaned,
    profile_url: `https://www.last.fm/user/${cleaned}`,
    session_key: 'manual-legacy-link'
  });
}

async function unlinkUser(discordUserId) {
  return musicStore.deleteLastFmAccount(discordUserId);
}

async function getLinkedUser(discordUserId) {
  return musicStore.getLastFmAccount(discordUserId);
}

async function resolveUsername(discordUserId, explicitUsername = '') {
  const direct = cleanUsername(explicitUsername);
  if (direct) return direct;

  const stored = await getLinkedUser(discordUserId);
  return cleanUsername(stored?.username || '');
}

module.exports = {
  cleanUsername,
  linkUser,
  unlinkUser,
  getLinkedUser,
  resolveUsername
};
