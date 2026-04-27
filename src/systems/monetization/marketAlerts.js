const db = require('../../services/database');
const logger = require('../logging/logger');

const ALERT_NAMESPACE = 'premium:market-alerts';
const DAY_MS = 24 * 60 * 60 * 1000;

function alertKey(type, userId, symbol) {
  return `${type}:${userId}:${String(symbol || '').toLowerCase()}`;
}

function nextRunAt(now = Date.now()) {
  return new Date(now + DAY_MS).toISOString();
}

async function upsertAlert(row) {
  const key = alertKey(row.type, row.userId, row.symbol);
  const record = {
    ...row,
    createdAt: row.createdAt || new Date().toISOString(),
    nextRunAt: row.nextRunAt || nextRunAt()
  };
  await db.setKv(ALERT_NAMESPACE, key, record);
  return record;
}

async function removeAlert(type, userId, symbol) {
  const key = alertKey(type, userId, symbol);
  const existing = await db.getKv(ALERT_NAMESPACE, key, null);
  if (!existing) return null;
  await db.deleteKv(ALERT_NAMESPACE, key).catch(() => null);
  return existing;
}

async function listAlerts(userId, type = null) {
  const rows = await db.listKv(ALERT_NAMESPACE, 1000).catch(() => []);
  return rows
    .map((entry) => entry.value || null)
    .filter(Boolean)
    .filter((entry) => String(entry.userId) === String(userId))
    .filter((entry) => !type || entry.type === type)
    .sort((a, b) => String(a.symbol || '').localeCompare(String(b.symbol || '')));
}

async function dueAlerts() {
  const now = Date.now();
  const rows = await db.listKv(ALERT_NAMESPACE, 1000).catch(() => []);
  return rows
    .map((entry) => entry.value || null)
    .filter(Boolean)
    .filter((entry) => new Date(entry.nextRunAt || 0).getTime() <= now);
}

async function fetchCryptoAlert(entry) {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(entry.coinId)}`;
  const payload = await fetch(url).then((res) => res.json()).catch(() => null);
  const row = payload?.[0];
  if (!row) return null;

  return {
    title: `${row.name} (${String(row.symbol || '').toUpperCase()})`,
    body: [
      `Price: $${Number(row.current_price || 0).toFixed(4)}`,
      `24h: ${Number(row.price_change_percentage_24h || 0).toFixed(2)}%`,
      `Market cap: $${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(row.market_cap || 0))}`
    ].join('\n')
  };
}

async function fetchCurrencyAlert(entry) {
  const payload = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(entry.base)}`)
    .then((res) => res.json())
    .catch(() => null);
  const rate = payload?.rates?.[entry.quote];
  if (!rate) return null;

  return {
    title: `${entry.base}/${entry.quote}`,
    body: `1 ${entry.base} = ${Number(rate).toFixed(4)} ${entry.quote}`
  };
}

async function renderAlert(entry) {
  if (entry.type === 'crypto') return fetchCryptoAlert(entry);
  if (entry.type === 'currency') return fetchCurrencyAlert(entry);
  return null;
}

async function runDueMarketAlerts(client) {
  if (!db.isSupabaseConfigured?.()) return { skipped: true, reason: 'database_not_configured' };
  if (db.getCircuitState?.().open) return { skipped: true, reason: 'database_circuit_open' };

  const due = await dueAlerts();

  for (const entry of due) {
    try {
      const user = await client.users.fetch(entry.userId).catch(() => null);
      if (!user) {
        await removeAlert(entry.type, entry.userId, entry.symbol);
        continue;
      }

      const rendered = await renderAlert(entry);
      if (rendered) {
        await user.send({
          content: `**${rendered.title}**\n${rendered.body}`,
          allowedMentions: { parse: [] }
        }).catch(() => null);
      }

      await upsertAlert({
        ...entry,
        nextRunAt: nextRunAt()
      });
    } catch (error) {
      logger.warn(
        {
          error,
          type: entry.type,
          userId: entry.userId,
          symbol: entry.symbol
        },
        'Market alert delivery failed'
      );
    }
  }

  return {
    ok: true,
    count: due.length
  };
}

function startMarketAlertRunner(client) {
  const intervalMs = Math.max(30000, Number(process.env.MARKET_ALERT_RUNNER_INTERVAL_MS || 300000));
  const interval = setInterval(() => {
    runDueMarketAlerts(client).catch((error) => {
      logger.warn({ error }, 'Market alert runner tick failed');
    });
  }, intervalMs);
  interval.unref?.();
  return interval;
}

module.exports = {
  upsertAlert,
  removeAlert,
  listAlerts,
  runDueMarketAlerts,
  startMarketAlertRunner
};
