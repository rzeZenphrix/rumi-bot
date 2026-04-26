const db = require('../database/db');

const memory = new Map();

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX || ',';

async function ensureTable() {
  if (!db.hasDatabaseConfigured?.()) return false;

  await db.exec(`
    create table if not exists guild_prefix_settings (
      guild_id text primary key,
      prefix text,
      default_prefix_enabled boolean not null default true,
      updated_at timestamptz not null default now()
    );
  `);

  return true;
}

async function getPrefixSettings(guildId) {
  const fallback = memory.get(guildId) || {
    prefix: null,
    defaultPrefixEnabled: true
  };

  const ready = await ensureTable();

  if (!ready) return fallback;

  const row = await db.one(
    `
    select prefix, default_prefix_enabled
    from guild_prefix_settings
    where guild_id = $1
    limit 1
    `,
    [guildId]
  );

  if (!row) return fallback;

  return {
    prefix: row.prefix,
    defaultPrefixEnabled: row.default_prefix_enabled !== false
  };
}

async function setCustomPrefix(guildId, prefix) {
  const current = await getPrefixSettings(guildId);

  const next = {
    ...current,
    prefix
  };

  memory.set(guildId, next);

  const ready = await ensureTable();

  if (ready) {
    await db.exec(
      `
      insert into guild_prefix_settings (guild_id, prefix, default_prefix_enabled, updated_at)
      values ($1, $2, $3, now())
      on conflict (guild_id)
      do update set prefix = excluded.prefix,
                    default_prefix_enabled = excluded.default_prefix_enabled,
                    updated_at = now()
      `,
      [guildId, prefix, next.defaultPrefixEnabled]
    );
  }

  return next;
}

async function setDefaultPrefixEnabled(guildId, enabled) {
  const current = await getPrefixSettings(guildId);

  const next = {
    ...current,
    defaultPrefixEnabled: Boolean(enabled)
  };

  memory.set(guildId, next);

  const ready = await ensureTable();

  if (ready) {
    await db.exec(
      `
      insert into guild_prefix_settings (guild_id, prefix, default_prefix_enabled, updated_at)
      values ($1, $2, $3, now())
      on conflict (guild_id)
      do update set prefix = excluded.prefix,
                    default_prefix_enabled = excluded.default_prefix_enabled,
                    updated_at = now()
      `,
      [guildId, next.prefix, next.defaultPrefixEnabled]
    );
  }

  return next;
}

async function getValidPrefixes(guildId, clientId) {
  const settings = await getPrefixSettings(guildId);
  const prefixes = [];

  if (settings.defaultPrefixEnabled) prefixes.push(DEFAULT_PREFIX);
  if (settings.prefix && !prefixes.includes(settings.prefix)) prefixes.push(settings.prefix);

  if (clientId) {
    prefixes.push(`<@${clientId}> `);
    prefixes.push(`<@!${clientId}> `);
  }

  return prefixes;
}

module.exports = {
  DEFAULT_PREFIX,
  getPrefixSettings,
  setCustomPrefix,
  setDefaultPrefixEnabled,
  getValidPrefixes
};