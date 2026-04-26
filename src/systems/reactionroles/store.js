const { readStore, writeStore } = require('../storage/jsonStore');

function emojiKey(emoji) {
  if (!emoji) return null;
  if (typeof emoji === 'string') {
    const custom = emoji.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
    return custom ? custom[1] : emoji;
  }
  return emoji.id || emoji.name;
}

function getStore() {
  return readStore('reactionRoles', { guilds: {} });
}

function saveStore(store) {
  return writeStore('reactionRoles', store);
}

function getGuild(guildId) {
  const store = getStore();
  store.guilds[guildId] ||= { messages: {} };
  saveStore(store);
  return store.guilds[guildId];
}

function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
  const store = getStore();
  store.guilds[guildId] ||= { messages: {} };
  store.guilds[guildId].messages[messageId] ||= { channelId, items: {} };
  store.guilds[guildId].messages[messageId].channelId = channelId;
  store.guilds[guildId].messages[messageId].items[emojiKey(emoji)] = roleId;
  saveStore(store);
}

function removeReactionRole(guildId, messageId, keyOrRoleId) {
  const store = getStore();
  const msg = store.guilds[guildId]?.messages?.[messageId];
  if (!msg) return false;
  const key = emojiKey(keyOrRoleId);
  if (msg.items[key]) delete msg.items[key];
  else {
    for (const [emoji, roleId] of Object.entries(msg.items)) {
      if (roleId === keyOrRoleId) delete msg.items[emoji];
    }
  }
  if (!Object.keys(msg.items).length) delete store.guilds[guildId].messages[messageId];
  saveStore(store);
  return true;
}

function clearReactionRoles(guildId, messageId) {
  const store = getStore();
  if (store.guilds[guildId]?.messages?.[messageId]) {
    delete store.guilds[guildId].messages[messageId];
    saveStore(store);
    return true;
  }
  return false;
}

function findRoleForReaction(guildId, messageId, emoji) {
  const store = getStore();
  return store.guilds[guildId]?.messages?.[messageId]?.items?.[emojiKey(emoji)] || null;
}

module.exports = { emojiKey, getGuild, addReactionRole, removeReactionRole, clearReactionRoles, findRoleForReaction };
