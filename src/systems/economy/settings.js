const db = require('../../services/database');

const SETTINGS_NAMESPACE = 'economy:settings';
const AUDIT_NAMESPACE = 'economy:audit';
const GIFT_CODES_NAMESPACE = 'economy:giftcodes';

function defaultSettings() {
  return {
    currencyName: 'coins',
    currencyIcon: '$',
    dailyBase: 250,
    weeklyBase: 1500,
    workMin: 75,
    workMax: 250,
    dailyCooldownSeconds: 24 * 60 * 60,
    weeklyCooldownSeconds: 7 * 24 * 60 * 60,
    workCooldownSeconds: 60 * 60,
    taxRate: 0,
    inflationEnabled: false,
    inflationRate: 0,
    robEnabled: false,
    robCooldownSeconds: 6 * 60 * 60,
    robMinAmount: 25,
    robMaxAmount: 250,
    robSuccessRate: 35,
    robFineRate: 50,
    robProtectionHours: 24,
    casinoEnabled: true,
    casinoCooldownSeconds: 10,
    casinoMinBet: 10,
    casinoMaxBet: 1000,
    voterBoostEnabled: true,
    disabledCommands: [],
    updatedAt: new Date(0).toISOString()
  };
}

function normalizeCurrencyIcon(value, fallback) {
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;
  if (/^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/.test(raw)) return raw;
  return raw.slice(0, 64);
}

function normalizeSettings(settings = {}) {
  const base = defaultSettings();
  const normalized = {
    ...base,
    ...settings
  };

  normalized.currencyName = String(normalized.currencyName || base.currencyName).trim().slice(0, 24) || base.currencyName;
  normalized.currencyIcon = normalizeCurrencyIcon(normalized.currencyIcon, base.currencyIcon) || base.currencyIcon;
  normalized.dailyBase = Math.max(0, Math.floor(Number(normalized.dailyBase || base.dailyBase)));
  normalized.weeklyBase = Math.max(0, Math.floor(Number(normalized.weeklyBase || base.weeklyBase)));
  normalized.workMin = Math.max(0, Math.floor(Number(normalized.workMin || base.workMin)));
  normalized.workMax = Math.max(normalized.workMin, Math.floor(Number(normalized.workMax || base.workMax)));
  normalized.dailyCooldownSeconds = Math.max(3, Math.floor(Number(normalized.dailyCooldownSeconds || base.dailyCooldownSeconds)));
  normalized.weeklyCooldownSeconds = Math.max(3, Math.floor(Number(normalized.weeklyCooldownSeconds || base.weeklyCooldownSeconds)));
  normalized.workCooldownSeconds = Math.max(3, Math.floor(Number(normalized.workCooldownSeconds || base.workCooldownSeconds)));
  normalized.taxRate = Math.max(0, Math.min(100, Number(normalized.taxRate || base.taxRate)));
  normalized.inflationEnabled = Boolean(normalized.inflationEnabled);
  normalized.inflationRate = Math.max(0, Math.min(100, Number(normalized.inflationRate || base.inflationRate)));
  normalized.robEnabled = Boolean(normalized.robEnabled);
  normalized.robCooldownSeconds = Math.max(10, Math.floor(Number(normalized.robCooldownSeconds || base.robCooldownSeconds)));
  normalized.robMinAmount = Math.max(1, Math.floor(Number(normalized.robMinAmount || base.robMinAmount)));
  normalized.robMaxAmount = Math.max(normalized.robMinAmount, Math.floor(Number(normalized.robMaxAmount || base.robMaxAmount)));
  normalized.robSuccessRate = Math.max(1, Math.min(95, Number(normalized.robSuccessRate || base.robSuccessRate)));
  normalized.robFineRate = Math.max(0, Math.min(100, Number(normalized.robFineRate || base.robFineRate)));
  normalized.robProtectionHours = Math.max(0, Math.min(720, Number(normalized.robProtectionHours ?? base.robProtectionHours)));
  normalized.casinoEnabled = normalized.casinoEnabled !== false;
  normalized.casinoCooldownSeconds = Math.max(3, Math.floor(Number(normalized.casinoCooldownSeconds || base.casinoCooldownSeconds)));
  normalized.casinoMinBet = Math.max(1, Math.floor(Number(normalized.casinoMinBet || base.casinoMinBet)));
  normalized.casinoMaxBet = Math.max(normalized.casinoMinBet, Math.floor(Number(normalized.casinoMaxBet || base.casinoMaxBet)));
  normalized.voterBoostEnabled = normalized.voterBoostEnabled !== false;
  normalized.disabledCommands = [...new Set((normalized.disabledCommands || []).map((item) => String(item).toLowerCase()).filter(Boolean))];
  normalized.updatedAt = new Date().toISOString();

  return normalized;
}

async function getEconomySettings(guildId) {
  const settings = await db.getKv(SETTINGS_NAMESPACE, guildId, defaultSettings());
  return normalizeSettings(settings);
}

async function saveEconomySettings(guildId, settings) {
  const normalized = normalizeSettings(settings);
  await db.setKv(SETTINGS_NAMESPACE, guildId, normalized);
  return normalized;
}

async function updateEconomySettings(guildId, updater) {
  const current = await getEconomySettings(guildId);
  const next = (await updater(current)) || current;
  return saveEconomySettings(guildId, next);
}

async function resetEconomySettings(guildId) {
  return saveEconomySettings(guildId, defaultSettings());
}

async function logEconomyAudit(guildId, row) {
  const key = `${Date.now()}:${row.actorId || 'system'}:${Math.random().toString(36).slice(2, 8)}`;
  await db.setKv(AUDIT_NAMESPACE, `${guildId}:${key}`, {
    ...row,
    guildId,
    createdAt: row.createdAt || new Date().toISOString()
  }).catch(() => null);
}

async function listEconomyAudit(guildId, limit = 20) {
  const rows = await db.listKv(AUDIT_NAMESPACE, Math.max(50, limit * 3)).catch(() => []);
  return rows
    .map((entry) => entry.value || null)
    .filter(Boolean)
    .filter((row) => row.guildId === guildId)
    .slice(0, limit);
}

async function createGiftCode(guildId, code, payload) {
  const normalizedCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (!normalizedCode) return null;

  const record = {
    ...payload,
    code: normalizedCode,
    guildId,
    usesRemaining: Math.max(1, Math.floor(Number(payload.usesRemaining || payload.uses || 1))),
    createdAt: new Date().toISOString()
  };

  await db.setKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`, record);
  return record;
}

async function getGiftCode(guildId, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  return db.getKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`, null);
}

async function removeGiftCode(guildId, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const existing = await getGiftCode(guildId, normalizedCode);
  if (!existing) return null;
  await db.deleteKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`).catch(() => null);
  return existing;
}

async function useGiftCode(guildId, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const existing = await getGiftCode(guildId, normalizedCode);
  if (!existing) return null;

  if (Number(existing.usesRemaining || 0) <= 0) {
    await db.deleteKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`).catch(() => null);
    return null;
  }

  const next = {
    ...existing,
    usesRemaining: Number(existing.usesRemaining || 0) - 1,
    redeemedAt: new Date().toISOString()
  };

  if (next.usesRemaining <= 0) {
    await db.deleteKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`).catch(() => null);
  } else {
    await db.setKv(GIFT_CODES_NAMESPACE, `${guildId}:${normalizedCode}`, next);
  }

  return next;
}

async function isEconomyCommandEnabled(guildId, commandName) {
  const settings = await getEconomySettings(guildId);
  return !settings.disabledCommands.includes(String(commandName || '').toLowerCase());
}

module.exports = {
  defaultSettings,
  normalizeSettings,
  getEconomySettings,
  saveEconomySettings,
  updateEconomySettings,
  resetEconomySettings,
  logEconomyAudit,
  listEconomyAudit,
  createGiftCode,
  getGiftCode,
  removeGiftCode,
  useGiftCode,
  isEconomyCommandEnabled
};
