const db = require('../../services/database');

function defaultTrustNobody(guildId) {
  return {
    guild_id: guildId,
    enabled: false,
    created_by: null,
    updated_by: null,
    activated_at: null
  };
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

async function getTrustNobodySettings(guildId) {
  const row = await queryData(
    db.supabase
      .from('trust_nobody_settings')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle(),
    'getTrustNobodySettings'
  );

  return {
    ...defaultTrustNobody(guildId),
    ...(row || {})
  };
}

async function saveTrustNobodySettings(guildId, patch = {}) {
  const current = await getTrustNobodySettings(guildId).catch(() => defaultTrustNobody(guildId));
  return queryData(
    db.supabase
      .from('trust_nobody_settings')
      .upsert(
        {
          ...current,
          ...patch,
          guild_id: guildId
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'saveTrustNobodySettings'
  );
}

module.exports = {
  defaultTrustNobody,
  getTrustNobodySettings,
  saveTrustNobodySettings
};
