const db = require('../services/database');

function guildNamespace(guildId, name) {
  return `guild:${guildId}:${name}`;
}

function userNamespace(userId, name) {
  return `user:${userId}:${name}`;
}

async function get(namespace, key, fallback = null) {
  return db.getKv(namespace, key, fallback);
}

async function set(namespace, key, value) {
  return db.setKv(namespace, key, value);
}

async function del(namespace, key) {
  return db.deleteKv(namespace, key);
}

async function list(namespace, limit = 100) {
  return db.listKv(namespace, limit);
}

async function getGuild(guildId, name, key, fallback = null) {
  return get(guildNamespace(guildId, name), key, fallback);
}

async function setGuild(guildId, name, key, value) {
  return set(guildNamespace(guildId, name), key, value);
}

async function listGuild(guildId, name, limit = 100) {
  return list(guildNamespace(guildId, name), limit);
}

async function getUser(userId, name, key, fallback = null) {
  return get(userNamespace(userId, name), key, fallback);
}

async function setUser(userId, name, key, value) {
  return set(userNamespace(userId, name), key, value);
}

async function listUser(userId, name, limit = 100) {
  return list(userNamespace(userId, name), limit);
}

module.exports = {
  guildNamespace,
  userNamespace,
  get,
  set,
  del,
  list,
  getGuild,
  setGuild,
  listGuild,
  getUser,
  setUser,
  listUser
};
