const db = require('../../services/database');

function defaultProfile() {
  return {
    bio: '',
    hideLeaderboard: false,
    karma: 0,
    streak: 0,
    socialLinks: [],
    lastKarmaGivenAt: 0,
    lastUpdatedAt: new Date().toISOString()
  };
}

function normalizeLinks(links = []) {
  return [...new Set((links || []).map((link) => String(link || '').trim()).filter(Boolean))].slice(0, 10);
}

async function getProfile(userId) {
  const profile = await db.getKv('social:profiles', userId, defaultProfile());
  return {
    ...defaultProfile(),
    ...profile,
    hideLeaderboard: Boolean(profile.hideLeaderboard),
    socialLinks: normalizeLinks(profile.socialLinks || [])
  };
}

async function saveProfile(userId, profile) {
  return db.setKv('social:profiles', userId, {
    ...defaultProfile(),
    ...profile,
    hideLeaderboard: Boolean(profile.hideLeaderboard),
    socialLinks: normalizeLinks(profile.socialLinks || []),
    lastUpdatedAt: new Date().toISOString()
  });
}

async function updateProfile(userId, updater) {
  const profile = await getProfile(userId);
  const next = await updater(profile) || profile;
  await saveProfile(userId, next);
  return next;
}

module.exports = {
  getProfile,
  saveProfile,
  updateProfile
};
