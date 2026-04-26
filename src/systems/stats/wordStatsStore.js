const { readStore, writeStore } = require('../storage/jsonStore');

const WORD_PATTERNS = {
  nword: /\bn[1i!|]gg(?:a|er|ers|as)\b/gi,
  hardr: /\bn[1i!|]ggers?\b/gi,
  fword: /\bf(?:u|v|oo)c?k(?:ing|ed|er|ers|s)?\b|\bfuh\b/gi
};

function getStore() {
  return readStore('wordStats', { users: {} });
}

function saveStore(store) {
  return writeStore('wordStats', store);
}

function ensureUser(store, userId) {
  store.users[userId] ||= {
    nword: 0,
    hardr: 0,
    fword: 0,
    lastSeenAt: null
  };
  return store.users[userId];
}

function countMatches(content, regex) {
  return [...String(content || '').matchAll(regex)].length;
}

function trackMessageWords(message) {
  if (!message?.author?.id || message.author.bot || !message.content) return null;

  const counts = {
    nword: countMatches(message.content, WORD_PATTERNS.nword),
    hardr: countMatches(message.content, WORD_PATTERNS.hardr),
    fword: countMatches(message.content, WORD_PATTERNS.fword)
  };

  if (!counts.nword && !counts.hardr && !counts.fword) return counts;

  const store = getStore();
  const user = ensureUser(store, message.author.id);

  user.nword += counts.nword;
  user.hardr += counts.hardr;
  user.fword += counts.fword;
  user.lastSeenAt = new Date().toISOString();

  saveStore(store);
  return counts;
}

function getUserWordStats(userId) {
  const store = getStore();
  const user = ensureUser(store, userId);
  return { ...user };
}

module.exports = {
  trackMessageWords,
  getUserWordStats
};
