const lastfmClient = require('../../services/lastfm/client');
const store = require('./store');

function normalizePeriod(value = '') {
  const input = String(value || '').trim().toLowerCase();
  if (['7day', 'week', 'weekly'].includes(input)) return '7day';
  if (['1month', 'month', 'monthly'].includes(input)) return '1month';
  if (['3month', 'quarter'].includes(input)) return '3month';
  if (['6month', 'halfyear'].includes(input)) return '6month';
  if (['12month', 'year', 'yearly'].includes(input)) return '12month';
  if (['overall', 'alltime', 'all'].includes(input)) return 'overall';
  return '7day';
}

function periodLabel(value = '') {
  const normalized = normalizePeriod(value);
  if (normalized === 'overall') return 'overall';
  return normalized;
}

async function getAccount(discordUserId) {
  return store.getLastFmAccount(discordUserId);
}

async function getLinkedUsername(discordUserId) {
  const account = await getAccount(discordUserId);
  return String(account?.username || '').trim();
}

module.exports = {
  normalizePeriod,
  periodLabel,
  getAccount,
  getLinkedUsername,
  getProfile: lastfmClient.getUserInfo,
  getRecent: lastfmClient.getRecentTracks,
  getTop: lastfmClient.getTop,
  getLoved: lastfmClient.getLovedTracks
};
