const db = require('../../services/database');

function mapRow(row) {
  if (!row) return null;

  return {
    guildId: row.guild_id,
    userId: row.user_id,
    reason: row.reason,
    moderatorId: row.moderator_id,
    deleteMessageSeconds: row.delete_message_seconds || 0,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function addHardban(guildId, userId, data = {}) {
  const { data: row, error } = await db.supabase
    .from('hardbans')
    .upsert(
      {
        guild_id: guildId,
        user_id: userId,
        reason: data.reason || 'Security hardban',
        moderator_id: data.moderatorId || null,
        delete_message_seconds: data.deleteMessageSeconds || 0,
        metadata: data.metadata || {}
      },
      { onConflict: 'guild_id,user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return mapRow(row);
}

async function removeHardban(guildId, userId) {
  const { data, error } = await db.supabase
    .from('hardbans')
    .delete()
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return mapRow(data);
}

async function getHardban(guildId, userId) {
  const { data, error } = await db.supabase
    .from('hardbans')
    .select('*')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return mapRow(data);
}

async function isHardbanned(guildId, userId) {
  return Boolean(await getHardban(guildId, userId));
}

async function listGuildHardbans(guildId) {
  const { data, error } = await db.supabase
    .from('hardbans')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapRow);
}

module.exports = {
  addHardban,
  removeHardban,
  getHardban,
  isHardbanned,
  listGuildHardbans
};