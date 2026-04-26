const { readStore, writeStore } = require('../storage/jsonStore');

function countMatches(content, regex) {
  return [...String(content || '').matchAll(regex)].length;
}

function getStore() {
  return readStore('wordCounts', { users: {} });
}

function saveStore(store) {
  writeStore('wordCounts', store);
}

function defaultCounts() {
  return {
    nwordTotal: 0,
    hardR: 0,
    fword: 0,
    fuh: 0
  };
}

function getUserCounts(userId) {
  const store = getStore();

  store.users[userId] ||= defaultCounts();
  saveStore(store);

  return store.users[userId];
}

function incrementFromContent(userId, content) {
  if (!userId || !content) return;

  const store = getStore();

  store.users[userId] ||= defaultCounts();

  const text = String(content);

  const nwordTotal = countMatches(text, /(?:^|[^a-z])n[i1!][gq]{2}(?:a|e?r)(?:$|[^a-z])/gi);
  const hardR = countMatches(text, /(?:^|[^a-z])n[i1!][gq]{2}e?r(?:$|[^a-z])/gi);
  const fword = countMatches(text, /(?:^|[^a-z])f[u*]c?k(?:$|[^a-z])/gi);
  const fuh = countMatches(text, /(?:^|[^a-z])fuh(?:$|[^a-z])/gi);

  if (!nwordTotal && !hardR && !fword && !fuh) return;

  store.users[userId].nwordTotal += nwordTotal;
  store.users[userId].hardR += hardR;
  store.users[userId].fword += fword;
  store.users[userId].fuh += fuh;

  saveStore(store);
}

module.exports = {
  getUserCounts,
  incrementFromContent
};