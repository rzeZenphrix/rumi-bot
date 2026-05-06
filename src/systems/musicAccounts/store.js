const crypto = require('node:crypto');
const db = require('../../services/database');

const SESSION_TTL_MS = Math.max(60_000, Number(process.env.MUSIC_LINK_SESSION_TTL_MS || 10 * 60 * 1000));
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || process.env.DASHBOARD_PUBLIC_URL || process.env.BOT_WEBSITE || 'https://rumi.rocks').replace(/\/+$/, '');

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

function normalizeProvider(provider = '') {
  const value = String(provider || '').trim().toLowerCase();
  if (!['spotify', 'lastfm'].includes(value)) {
    throw new Error(`Unsupported music integration provider: ${provider}`);
  }
  return value;
}

function publicMusicRoute(provider, path = 'start', token = '') {
  const encoded = encodeURIComponent(String(token || '').trim());
  return `${PUBLIC_SITE_URL}/auth/${normalizeProvider(provider)}/${path}${encoded ? `?token=${encoded}` : ''}`;
}

async function createMusicLinkSession(provider, discordUserId, options = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const userId = String(discordUserId || '').trim();
  if (!userId) {
    throw new Error('discordUserId is required to create a music link session.');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const row = await queryData(
    db.supabase
      .from('music_link_sessions')
      .insert({
        provider: normalizedProvider,
        discord_user_id: userId,
        token_hash: sha256(token),
        nonce,
        source: String(options.source || 'bot').trim().toLowerCase() || 'bot',
        status: 'pending',
        metadata_json: options.metadata || {},
        expires_at: expiresAt
      })
      .select()
      .single(),
    'createMusicLinkSession'
  );

  return {
    ...row,
    token,
    authorizeUrl: publicMusicRoute(normalizedProvider, 'start', token),
    expires_at: row?.expires_at || expiresAt
  };
}

async function getSpotifyAccount(discordUserId) {
  return queryData(
    db.supabase
      .from('linked_spotify_accounts')
      .select('*')
      .eq('discord_user_id', String(discordUserId || '').trim())
      .maybeSingle(),
    'getSpotifyAccount'
  );
}

async function saveSpotifyAccount(discordUserId, payload = {}) {
  return queryData(
    db.supabase
      .from('linked_spotify_accounts')
      .upsert(
        {
          ...payload,
          discord_user_id: String(discordUserId || '').trim(),
          refreshed_at: payload.refreshed_at || nowIso()
        },
        { onConflict: 'discord_user_id' }
      )
      .select()
      .single(),
    'saveSpotifyAccount'
  );
}

async function deleteSpotifyAccount(discordUserId) {
  return queryData(
    db.supabase
      .from('linked_spotify_accounts')
      .delete()
      .eq('discord_user_id', String(discordUserId || '').trim())
      .select(),
    'deleteSpotifyAccount'
  );
}

async function getLastFmAccount(discordUserId) {
  return queryData(
    db.supabase
      .from('linked_lastfm_accounts')
      .select('*')
      .eq('discord_user_id', String(discordUserId || '').trim())
      .maybeSingle(),
    'getLastFmAccount'
  );
}

async function saveLastFmAccount(discordUserId, payload = {}) {
  return queryData(
    db.supabase
      .from('linked_lastfm_accounts')
      .upsert(
        {
          ...payload,
          discord_user_id: String(discordUserId || '').trim()
        },
        { onConflict: 'discord_user_id' }
      )
      .select()
      .single(),
    'saveLastFmAccount'
  );
}

async function deleteLastFmAccount(discordUserId) {
  return queryData(
    db.supabase
      .from('linked_lastfm_accounts')
      .delete()
      .eq('discord_user_id', String(discordUserId || '').trim())
      .select(),
    'deleteLastFmAccount'
  );
}

module.exports = {
  normalizeProvider,
  publicMusicRoute,
  createMusicLinkSession,
  getSpotifyAccount,
  saveSpotifyAccount,
  deleteSpotifyAccount,
  getLastFmAccount,
  saveLastFmAccount,
  deleteLastFmAccount
};
