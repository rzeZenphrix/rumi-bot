const db = require('../../services/database');

function emojiKey(emoji) {
  if (!emoji) return null;
  if (typeof emoji === 'string') {
    const custom = emoji.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
    return custom ? custom[1] : emoji;
  }
  return emoji.id || emoji.name;
}

async function getGuild(guildId) {
  return db.getKv('reactionroles:guilds', guildId, { messages: {} });
}

async function saveGuild(guildId, guild) {
  return db.setKv('reactionroles:guilds', guildId, guild);
}

async function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
  const guild = await getGuild(guildId);
  guild.messages ||= {};
  guild.messages[messageId] ||= { channelId, items: {} };
  guild.messages[messageId].channelId = channelId;
  guild.messages[messageId].items[emojiKey(emoji)] = roleId;
  await saveGuild(guildId, guild);
}

async function removeReactionRole(guildId, messageId, keyOrRoleId) {
  const guild = await getGuild(guildId);
  const msg = guild.messages?.[messageId];
  if (!msg) return false;
  const key = emojiKey(keyOrRoleId);
  if (msg.items[key]) delete msg.items[key];
  else {
    for (const [emoji, roleId] of Object.entries(msg.items || {})) {
      if (roleId === keyOrRoleId) delete msg.items[emoji];
    }
  }
  if (!Object.keys(msg.items || {}).length) delete guild.messages[messageId];
  await saveGuild(guildId, guild);
  return true;
}

async function clearReactionRoles(guildId, messageId) {
  const guild = await getGuild(guildId);
  if (guild.messages?.[messageId]) {
    delete guild.messages[messageId];
    await saveGuild(guildId, guild);
    return true;
  }
  return false;
}

async function findRoleForReaction(guildId, messageId, emoji) {
  const guild = await getGuild(guildId);
  return guild.messages?.[messageId]?.items?.[emojiKey(emoji)] || null;
}

module.exports = {
  emojiKey,
  getGuild,
  addReactionRole,
  removeReactionRole,
  clearReactionRoles,
  findRoleForReaction
};
