const db = require('../../services/database');

function countMatches(content, regex) {
  return [...String(content || '').matchAll(regex)].length;
}

function defaultCounts() {
  return {
    nwordTotal: 0,
    hardR: 0,
    fword: 0,
    fuh: 0
  };
}

async function getUserCounts(userId) {
  return db.getKv('counters:words', userId, defaultCounts());
}

async function incrementFromContent(userId, content) {
  if (!userId || !content) return;

  const text = String(content);

  const nwordTotal = countMatches(text, /(?:^|[^a-z])n[i1!][gq]{2}(?:a|e?r)(?:$|[^a-z])/gi);
  const hardR = countMatches(text, /(?:^|[^a-z])n[i1!][gq]{2}e?r(?:$|[^a-z])/gi);
  const fword = countMatches(text, /(?:^|[^a-z])f[u*]c?k(?:$|[^a-z])/gi);
  const fuh = countMatches(text, /(?:^|[^a-z])fuh(?:$|[^a-z])/gi);

  if (!nwordTotal && !hardR && !fword && !fuh) return;

  const current = await getUserCounts(userId);
  current.nwordTotal += nwordTotal;
  current.hardR += hardR;
  current.fword += fword;
  current.fuh += fuh;
  await db.setKv('counters:words', userId, current);
}

module.exports = {
  getUserCounts,
  incrementFromContent
};
