const activeCooldowns = new Map();

function key({ guildId, userId, commandName }) {
  return `${guildId}:${userId}:${commandName}`;
}

function checkCooldown({ guildId, userId, commandName, seconds }) {
  const id = key({ guildId, userId, commandName });
  const expiresAt = activeCooldowns.get(id) || 0;
  const now = Date.now();

  if (expiresAt > now) {
    return {
      ok: false,
      remainingMs: expiresAt - now
    };
  }

  return {
    ok: true,
    remainingMs: 0
  };
}

function setCooldown({ guildId, userId, commandName, seconds }) {
  const id = key({ guildId, userId, commandName });
  activeCooldowns.set(id, Date.now() + seconds * 1000);
}

function formatRemaining(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const leftover = seconds % 60;

  return leftover ? `${minutes}m ${leftover}s` : `${minutes}m`;
}

module.exports = {
  checkCooldown,
  setCooldown,
  formatRemaining
};