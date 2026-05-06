const db = require('../../services/database');

const ACCOUNT_VERSION = 3;
const STARTING_BALANCE = 0;
const TRANSACTION_LIMIT = 100;
const GUILD_SHOP_NAMESPACE = 'economy:guild-shop';

const RUMI_SHOP_ITEMS = {
  vape: {
    key: 'vape',
    name: 'Vape',
    category: 'consumable',
    price: 250,
    description: 'A rechargeable vape you can hit until the juice or durability runs out.',
    create() {
      return {
        kind: 'rumi',
        type: 'vape',
        hits: 0,
        juice: 8,
        durability: 12,
        status: 'active'
      };
    }
  },
  vapejuice: {
    key: 'vapejuice',
    name: 'Vape Juice',
    category: 'consumable',
    price: 75,
    description: 'Refills an empty vape back to full juice.',
    create() {
      return {
        kind: 'rumi',
        type: 'vapejuice',
        charges: 1,
        status: 'active'
      };
    }
  },
  cigarette: {
    key: 'cigarette',
    name: 'Cigarette Pack',
    category: 'consumable',
    price: 180,
    description: 'A pack of cigarettes. You need a lighter before you can smoke one.',
    create() {
      return {
        kind: 'rumi',
        type: 'cigarette',
        sticks: 10,
        smoked: 0,
        status: 'active'
      };
    }
  },
  lighter: {
    key: 'lighter',
    name: 'Lighter',
    category: 'tool',
    price: 60,
    description: 'Required to use cigarettes. Each light consumes one charge.',
    create() {
      return {
        kind: 'rumi',
        type: 'lighter',
        charges: 25,
        status: 'active'
      };
    }
  },
};

function accountNamespace(guildId) {
  return `guild:${guildId}:economy`;
}

function transactionNamespace(guildId) {
  return `guild:${guildId}:economy:transactions`;
}

function defaultGuildShop() {
  return {
    items: {}
  };
}

function defaultAccount() {
  return {
    version: ACCOUNT_VERSION,
    cash: STARTING_BALANCE,
    bank: 0,
    inventory: [],
    lastDaily: 0,
    lastWeekly: 0,
    lastWork: 0,
    totalEarned: 0,
    totalSpent: 0,
    totalTransferredIn: 0,
    totalTransferredOut: 0,
    updatedAt: new Date(0).toISOString()
  };
}

function formatCoins(value) {
  return new Intl.NumberFormat('en-GB').format(Math.max(0, Math.floor(Number(value || 0))));
}

function parseAmount(input, max = Number.MAX_SAFE_INTEGER) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return NaN;

  if (raw === 'all' || raw === 'max') {
    return Math.max(0, Math.floor(Number(max || 0)));
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) return NaN;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return NaN;

  const multiplier = match[2]
    ? { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[2].toLowerCase()] || 1
    : 1;

  return Math.floor(base * multiplier);
}

function totalWealth(account = {}) {
  return Math.max(0, Number(account.cash || 0)) + Math.max(0, Number(account.bank || 0));
}

function normalizeKey(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32);
}

function normalizeInventory(items = []) {
  const normalized = [];
  for (const item of items) {
    if (!item?.type) continue;

    normalized.push({
      charges: Number(item.charges || item.uses || 0),
      description: item.description || null,
      displayName: item.displayName || item.name || item.type,
      durability: Number(item.durability || 0),
      hits: Number(item.hits || 0),
      id: item.id || `${item.type}:${item.createdAt || item.purchasedAt || Date.now()}`,
      itemKey: item.itemKey || normalizeKey(item.type),
      juice: Number(item.juice || 0),
      kind: item.kind || 'guild',
      lastUsedAt: item.lastUsedAt || null,
      smoked: Number(item.smoked || 0),
      sticks: Number(item.sticks || 0),
      price: Number(item.price || 0),
      purchasedAt: item.purchasedAt || item.createdAt || new Date().toISOString(),
      rarity: item.rarity || null,
      sellPrice: Number(item.sellPrice || 0),
      status: item.status || 'active',
      type: item.type
    });
  }
  return normalized;
}

function normalizeGuildShop(shop = {}) {
  const output = defaultGuildShop();
  for (const [key, value] of Object.entries(shop.items || {})) {
    const itemKey = normalizeKey(key || value?.itemKey || value?.name);
    if (!itemKey || !value?.name) continue;

    output.items[itemKey] = {
      codes: Array.isArray(value.codes) ? value.codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean).slice(0, 100) : [],
      itemKey,
      name: String(value.name).trim().slice(0, 48),
      giftcards: Array.isArray(value.giftcards)
        ? value.giftcards
            .map((card) => ({
              code: String(card.code || '').trim().toUpperCase().slice(0, 32),
              amount: Math.max(0, Math.floor(Number(card.amount || 0)))
            }))
            .filter((card) => card.code && card.amount >= 0)
            .slice(0, 100)
        : [],
      price: Math.max(1, Math.floor(Number(value.price || 0))),
      redeemInstructions: String(value.redeemInstructions || '').trim().slice(0, 240),
      roleIds: Array.isArray(value.roleIds) ? value.roleIds.map((id) => String(id)).filter(Boolean).slice(0, 25) : [],
      sellPrice: Math.max(0, Math.floor(Number(value.sellPrice || 0))),
      description: String(value.description || '').trim().slice(0, 240),
      createdAt: value.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return output;
}

async function getAccount(guildId, userId) {
  const account = await db.getKv(accountNamespace(guildId), userId, defaultAccount());
  return {
    ...defaultAccount(),
    ...account,
    version: ACCOUNT_VERSION,
    inventory: normalizeInventory(account.inventory || []),
    updatedAt: account.updatedAt || new Date(0).toISOString()
  };
}

async function saveAccount(guildId, userId, account) {
  return db.setKv(accountNamespace(guildId), userId, {
    ...defaultAccount(),
    ...account,
    version: ACCOUNT_VERSION,
    inventory: normalizeInventory(account.inventory || []),
    updatedAt: new Date().toISOString()
  });
}

async function updateAccount(guildId, userId, updater) {
  const account = await getAccount(guildId, userId);
  const next = (await updater(account)) || account;
  await saveAccount(guildId, userId, next);
  return next;
}

async function logTransaction(guildId, row) {
  const key = `${Date.now()}:${row.userId || row.fromUserId || 'unknown'}:${Math.random().toString(36).slice(2, 8)}`;
  await db.setKv(transactionNamespace(guildId), key, {
    ...row,
    createdAt: row.createdAt || new Date().toISOString()
  }).catch(() => null);
}

async function listTransactions(guildId, userId, limit = 10) {
  const rows = await db.listKv(transactionNamespace(guildId), Math.max(limit * 5, TRANSACTION_LIMIT)).catch(() => []);
  return rows
    .map((entry) => entry.value || null)
    .filter(Boolean)
    .filter((entry) => entry.userId === userId || entry.fromUserId === userId || entry.toUserId === userId)
    .slice(0, limit);
}

async function listGuildTransactions(guildId, limit = 25) {
  const rows = await db.listKv(transactionNamespace(guildId), Math.max(limit * 5, TRANSACTION_LIMIT)).catch(() => []);
  return rows
    .map((entry) => entry.value || null)
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(100, Number(limit || 25))));
}

function getRumiShopItems() {
  return Object.values(RUMI_SHOP_ITEMS);
}

function getRumiShopItem(key) {
  return RUMI_SHOP_ITEMS[normalizeKey(key)] || null;
}

function createRumiInventoryItem(key) {
  const item = getRumiShopItem(key);
  if (!item) return null;

  const created = item.create();
  return {
    ...created,
    displayName: item.name,
    description: item.description,
    itemKey: item.key,
    price: item.price,
    sellPrice: 0,
    id: `${item.key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    purchasedAt: new Date().toISOString()
  };
}

async function getGuildShop(guildId) {
  const stored = await db.getKv(GUILD_SHOP_NAMESPACE, guildId, defaultGuildShop());
  return normalizeGuildShop(stored);
}

async function saveGuildShop(guildId, shop) {
  return db.setKv(GUILD_SHOP_NAMESPACE, guildId, normalizeGuildShop(shop));
}

async function updateGuildShop(guildId, updater) {
  const shop = await getGuildShop(guildId);
  const next = (await updater(shop)) || shop;
  await saveGuildShop(guildId, next);
  return next;
}

async function upsertGuildShopItem(guildId, item) {
  const itemKey = normalizeKey(item.itemKey || item.name);
  if (!itemKey) return null;

  const shop = await updateGuildShop(guildId, (current) => {
    current.items[itemKey] = {
      codes: Array.isArray(item.codes)
        ? item.codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean).slice(0, 100)
        : current.items[itemKey]?.codes || [],
      itemKey,
      name: String(item.name || itemKey).trim().slice(0, 48),
      giftcards: Array.isArray(item.giftcards)
        ? item.giftcards
            .map((card) => ({
              code: String(card.code || '').trim().toUpperCase().slice(0, 32),
              amount: Math.max(0, Math.floor(Number(card.amount || 0)))
            }))
            .filter((card) => card.code)
            .slice(0, 100)
        : current.items[itemKey]?.giftcards || [],
      price: Math.max(1, Math.floor(Number(item.price || 0))),
      redeemInstructions: String(item.redeemInstructions || current.items[itemKey]?.redeemInstructions || '').trim().slice(0, 240),
      roleIds: Array.isArray(item.roleIds) ? item.roleIds : current.items[itemKey]?.roleIds || [],
      sellPrice: Math.max(0, Math.floor(Number(item.sellPrice || 0))),
      description: String(item.description || '').trim().slice(0, 240),
      createdAt: current.items[itemKey]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return current;
  });

  return shop.items[itemKey] || null;
}

async function removeGuildShopItem(guildId, itemKey) {
  const key = normalizeKey(itemKey);
  let removed = null;

  await updateGuildShop(guildId, (current) => {
    removed = current.items[key] || null;
    delete current.items[key];
    return current;
  });

  return removed;
}

async function listGuildShopItems(guildId) {
  const shop = await getGuildShop(guildId);
  return Object.values(shop.items).sort((a, b) => a.name.localeCompare(b.name));
}

async function getGuildShopItem(guildId, itemKey) {
  const shop = await getGuildShop(guildId);
  return shop.items[normalizeKey(itemKey)] || null;
}

function createGuildInventoryItem(item) {
  return {
    kind: 'guild',
    type: normalizeKey(item.itemKey || item.name),
    displayName: item.name,
    description: item.description,
    itemKey: normalizeKey(item.itemKey || item.name),
    price: item.price,
    sellPrice: item.sellPrice,
    status: 'active',
    id: `${normalizeKey(item.itemKey || item.name)}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    purchasedAt: new Date().toISOString()
  };
}

function activeVape(account) {
  return (account.inventory || []).find((item) => item.kind === 'rumi' && item.type === 'vape' && item.status === 'active');
}

function refillableVape(account) {
  return (account.inventory || []).find((item) =>
    item.kind === 'rumi' &&
    item.type === 'vape' &&
    item.status !== 'dead' &&
    Number(item.durability || 0) > 0
  );
}

function findInventoryItem(account, itemKey, kind = null) {
  const key = normalizeKey(itemKey);
  return (account.inventory || []).find((item) => {
    if (item.status === 'sold') return false;
    if (kind && item.kind !== kind) return false;
    return normalizeKey(item.itemKey || item.type) === key;
  });
}

async function transferCash(guildId, fromUserId, toUserId, amount, options = {}) {
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!value) return { ok: false, reason: 'amount' };
  const taxRate = Math.max(0, Math.min(100, Number(options.taxRate || 0)));
  const taxAmount = Math.floor((value * taxRate) / 100);
  const totalDebit = value + taxAmount;

  const from = await getAccount(guildId, fromUserId);
  if (Number(from.cash || 0) < totalDebit) {
    return { ok: false, reason: 'funds', from };
  }

  const to = await getAccount(guildId, toUserId);
  from.cash -= totalDebit;
  from.totalTransferredOut = Number(from.totalTransferredOut || 0) + totalDebit;
  to.cash = Number(to.cash || 0) + value;
  to.totalTransferredIn = Number(to.totalTransferredIn || 0) + value;

  await saveAccount(guildId, fromUserId, from);
  await saveAccount(guildId, toUserId, to);
  await logTransaction(guildId, { type: 'transfer', amount: value, taxAmount, fromUserId, toUserId });

  return { ok: true, from, to, amount: value, taxAmount, totalDebit };
}

async function depositCash(guildId, userId, amount) {
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!value) return { ok: false, reason: 'amount' };

  const account = await getAccount(guildId, userId);
  if (Number(account.cash || 0) < value) {
    return { ok: false, reason: 'funds', account };
  }

  account.cash -= value;
  account.bank = Number(account.bank || 0) + value;
  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'deposit', amount: value, userId });

  return { ok: true, account, amount: value };
}

async function withdrawCash(guildId, userId, amount) {
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!value) return { ok: false, reason: 'amount' };

  const account = await getAccount(guildId, userId);
  if (Number(account.bank || 0) < value) {
    return { ok: false, reason: 'funds', account };
  }

  account.bank -= value;
  account.cash = Number(account.cash || 0) + value;
  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'withdraw', amount: value, userId });

  return { ok: true, account, amount: value };
}

async function purchaseRumiShopItem(guildId, userId, itemKey) {
  const definition = getRumiShopItem(itemKey);
  if (!definition) return { ok: false, reason: 'missing-item' };

  const account = await getAccount(guildId, userId);
  if (Number(account.cash || 0) < definition.price) {
    return { ok: false, reason: 'funds', item: definition, account };
  }

  const item = createRumiInventoryItem(definition.key);
  account.cash -= definition.price;
  account.totalSpent = Number(account.totalSpent || 0) + definition.price;
  account.inventory ||= [];
  account.inventory.push(item);

  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'buy-rumi', amount: definition.price, userId, itemKey: definition.key });

  return { ok: true, account, item, definition };
}

async function refillVape(guildId, userId) {
  const account = await getAccount(guildId, userId);
  const vape = refillableVape(account);
  if (!vape) return { ok: false, reason: 'missing-vape', account };

  const juice = findInventoryItem(account, 'vapejuice', 'rumi');
  if (!juice) return { ok: false, reason: 'missing-juice', account, vape };

  if (Number(vape.juice || 0) > 0 && vape.status === 'active') {
    return { ok: false, reason: 'already-filled', account, vape };
  }

  juice.status = 'used';
  juice.charges = 0;
  vape.juice = 8;
  vape.status = Number(vape.durability || 0) > 0 ? 'active' : 'dead';

  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'refill-vape', amount: 0, userId, itemKey: 'vapejuice' });

  return { ok: true, account, vape };
}

async function purchaseGuildShopItem(guildId, userId, itemKey) {
  const definition = await getGuildShopItem(guildId, itemKey);
  if (!definition) return { ok: false, reason: 'missing-item' };

  const account = await getAccount(guildId, userId);
  if (Number(account.cash || 0) < definition.price) {
    return { ok: false, reason: 'funds', item: definition, account };
  }

  const item = createGuildInventoryItem(definition);
  account.cash -= definition.price;
  account.totalSpent = Number(account.totalSpent || 0) + definition.price;
  account.inventory ||= [];
  account.inventory.push(item);

  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'buy-guild', amount: definition.price, userId, itemKey: definition.itemKey });

  return { ok: true, account, item, definition };
}

async function sellGuildShopItem(guildId, userId, itemKey) {
  const account = await getAccount(guildId, userId);
  const item = findInventoryItem(account, itemKey, 'guild');

  if (!item) {
    return { ok: false, reason: 'missing-item', account };
  }

  item.status = 'sold';
  const amount = Math.max(0, Number(item.sellPrice || 0));
  account.cash = Number(account.cash || 0) + amount;
  await saveAccount(guildId, userId, account);
  await logTransaction(guildId, { type: 'sell-guild', amount, userId, itemKey: item.itemKey });

  return { ok: true, account, item, amount };
}

async function addEarnings(guildId, userId, amount, type, metadata = {}) {
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  const account = await updateAccount(guildId, userId, (current) => {
    current.cash = Number(current.cash || 0) + value;
    current.totalEarned = Number(current.totalEarned || 0) + value;
    return current;
  });

  await logTransaction(guildId, { type, amount: value, userId, metadata });
  return account;
}

async function getLeaderboard(guildId, limit = 10) {
  const rows = await db.listKv(accountNamespace(guildId), 1000).catch(() => []);
  return rows
    .map((entry) => ({
      userId: entry.key,
      account: {
        ...defaultAccount(),
        ...(entry.value || {})
      }
    }))
    .sort((a, b) => totalWealth(b.account) - totalWealth(a.account))
    .slice(0, Math.max(1, Math.min(25, Number(limit || 10))));
}

module.exports = {
  ACCOUNT_VERSION,
  STARTING_BALANCE,
  TRANSACTION_LIMIT,
  RUMI_SHOP_ITEMS,
  defaultAccount,
  defaultGuildShop,
  formatCoins,
  parseAmount,
  totalWealth,
  normalizeKey,
  normalizeInventory,
  getAccount,
  saveAccount,
  updateAccount,
  logTransaction,
  listTransactions,
  listGuildTransactions,
  getRumiShopItems,
  getRumiShopItem,
  getGuildShop,
  saveGuildShop,
  updateGuildShop,
  upsertGuildShopItem,
  removeGuildShopItem,
  listGuildShopItems,
  getGuildShopItem,
  activeVape,
  findInventoryItem,
  transferCash,
  depositCash,
  withdrawCash,
  purchaseRumiShopItem,
  refillVape,
  purchaseGuildShopItem,
  sellGuildShopItem,
  addEarnings,
  getLeaderboard
};
