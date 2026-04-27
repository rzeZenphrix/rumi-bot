const respond = require('../../utils/respond');
const { PermissionFlagsBits } = require('discord.js');
const { extractId } = require('../../utils/resolveUser');
const {
  formatCoins,
  listGuildShopItems,
  upsertGuildShopItem,
  removeGuildShopItem,
  getGuildShopItem,
  parseAmount
} = require('../../systems/economy/store');
const { createGiftCode, removeGiftCode, useGiftCode, logEconomyAudit, getEconomySettings } = require('../../systems/economy/settings');

async function findRole(guild, input) {
  if (!input) return null;
  const id = String(input).match(/^<@&(\d{17,20})>$/)?.[1] || (extractId(input) ? extractId(input) : null);
  if (id) return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);
  const q = String(input).toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === q || r.name.toLowerCase().includes(q)) || null;
}

function canManageShop(message) {
  return message.guild?.ownerId === message.author.id
    || message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  name: 'shop',
  aliases: ['store'],
  category: 'economy',
  description: 'Browse or manage this server shop.',
  usage: 'shop [list|view|add|edit|remove|price|sellprice|desc|role|code|giftcard|redeem] ...',
  examples: ['shop', 'shop add coffee 150 45 | Fresh server coffee', 'shop role add coffee @Member', 'shop redeem WELCOME1'],
  guildOnly: true,

  async execute({ message, args }) {
    const sub = String(args.shift() || 'list').toLowerCase();
    const settings = await getEconomySettings(message.guild.id);

    if (!['list', 'view', 'add', 'edit', 'remove', 'price', 'sellprice', 'desc', 'role', 'code', 'giftcard', 'redeem'].includes(sub)) {
      return respond.reply(message, 'info', 'Use `shop list`, `view`, `add`, `edit`, `remove`, `price`, `sellprice`, `desc`, `role`, `code`, `giftcard`, or `redeem`.');
    }

    if (sub === 'list') {
      const items = await listGuildShopItems(message.guild.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: items.length
          ? items
              .map((item) => `**${item.name}**\nPrice: ${settings.currencyIcon} ${formatCoins(item.price)} | Sell: ${settings.currencyIcon} ${formatCoins(item.sellPrice)}\n${item.description || 'No description set.'}`)
              .join('\n\n')
          : 'This server shop does not have any items yet.'
      });
    }

    if (sub === 'view') {
      const name = args.join(' ');
      if (!name) return respond.reply(message, 'info', 'Use `shop view <item>`.');
      const item = await getGuildShopItem(message.guild.id, name);
      if (!item) return respond.reply(message, 'bad', 'I could not find that server shop item.');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          `**${item.name}**`,
          `Price: ${settings.currencyIcon} ${formatCoins(item.price)}`,
          `Sell: ${settings.currencyIcon} ${formatCoins(item.sellPrice)}`,
          `Roles: ${item.roleIds?.length ? item.roleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}`,
          `Redeem instructions: ${item.redeemInstructions || 'none'}`,
          `Codes: \`${item.codes?.length || 0}\``,
          `Giftcards: \`${item.giftcards?.length || 0}\``,
          '',
          item.description || 'No description set.'
        ].join('\n')
      });
    }

    if (!canManageShop(message)) {
      return respond.reply(message, 'bad', 'Only the server owner or managers with Manage Server can change the shop.');
    }

    if (sub === 'add' || sub === 'edit') {
      const joined = args.join(' ');
      const [left, description = ''] = joined.split('|').map((part) => part.trim());
      const parts = left.split(/\s+/).filter(Boolean);
      const name = parts.shift();
      const price = parseAmount(parts.shift());
      const sellPrice = parseAmount(parts.shift() || '0');

      if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(sellPrice) || sellPrice < 0) {
        return respond.reply(message, 'info', 'Use `shop add <name> <price> [sellprice] | <description>`.');
      }

      const item = await upsertGuildShopItem(message.guild.id, {
        name,
        price,
        sellPrice,
        description
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `shop.${sub}`, value: `${item.itemKey}:${item.price}` });

      return respond.reply(message, 'good', `${sub === 'add' ? 'Added' : 'Updated'} **${item.name}** in this server shop for **${settings.currencyIcon} ${formatCoins(item.price)}**.`);
    }

    if (sub === 'remove') {
      const name = args.join(' ');
      if (!name) return respond.reply(message, 'info', 'Use `shop remove <item>`.');

      const removed = await removeGuildShopItem(message.guild.id, name);
      if (!removed) return respond.reply(message, 'bad', 'I could not find that server shop item.');
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'shop.remove', value: removed.itemKey });

      return respond.reply(message, 'good', `Removed **${removed.name}** from this server shop.`);
    }

    if (sub === 'price' || sub === 'sellprice') {
      const name = args.shift();
      const amount = parseAmount(args.shift());
      if (!name || !Number.isFinite(amount) || amount < 0) {
        return respond.reply(message, 'info', `Use \`shop ${sub} <item> <amount>\`.`);
      }

      const existing = await getGuildShopItem(message.guild.id, name);
      if (!existing) return respond.reply(message, 'bad', 'I could not find that server shop item.');

      const item = await upsertGuildShopItem(message.guild.id, {
        ...existing,
        [sub === 'price' ? 'price' : 'sellPrice']: amount
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `shop.${sub}`, value: `${item.itemKey}:${amount}` });

      return respond.reply(message, 'good', `Updated **${item.name}** ${sub === 'price' ? 'price' : 'sell price'} to **${settings.currencyIcon} ${formatCoins(amount)}**.`);
    }

    if (sub === 'desc') {
      const name = args.shift();
      const description = args.join(' ').trim();
      if (!name || !description) {
        return respond.reply(message, 'info', 'Use `shop desc <item> <description>`.');
      }

      const existing = await getGuildShopItem(message.guild.id, name);
      if (!existing) return respond.reply(message, 'bad', 'I could not find that server shop item.');

      const item = await upsertGuildShopItem(message.guild.id, {
        ...existing,
        description
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'shop.desc', value: item.itemKey });

      return respond.reply(message, 'good', `Updated **${item.name}** description.`);
    }

    if (sub === 'role') {
      const mode = String(args.shift() || '').toLowerCase();
      const itemName = args.shift();
      const role = await findRole(message.guild, args.join(' '));
      if (!['add', 'remove'].includes(mode) || !itemName || !role) {
        return respond.reply(message, 'info', 'Use `shop role <add|remove> <item> <role>`.');
      }
      const existing = await getGuildShopItem(message.guild.id, itemName);
      if (!existing) return respond.reply(message, 'bad', 'I could not find that server shop item.');
      const roleIds = new Set(existing.roleIds || []);
      if (mode === 'add') roleIds.add(role.id);
      else roleIds.delete(role.id);
      const item = await upsertGuildShopItem(message.guild.id, {
        ...existing,
        roleIds: [...roleIds]
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `shop.role.${mode}`, value: `${item.itemKey}:${role.id}` });
      return respond.reply(message, 'good', `${mode === 'add' ? 'Added' : 'Removed'} ${role} ${mode === 'add' ? 'to' : 'from'} **${item.name}** restrictions.`);
    }

    if (sub === 'code') {
      const mode = String(args.shift() || '').toLowerCase();
      const itemName = args.shift();
      const code = String(args.shift() || '').trim().toUpperCase();
      if (!['create', 'remove'].includes(mode) || !itemName || !code) {
        return respond.reply(message, 'info', 'Use `shop code <create|remove> <item> <code>`.');
      }
      const existing = await getGuildShopItem(message.guild.id, itemName);
      if (!existing) return respond.reply(message, 'bad', 'I could not find that server shop item.');
      const codes = new Set(existing.codes || []);
      if (mode === 'create') codes.add(code);
      else codes.delete(code);
      const item = await upsertGuildShopItem(message.guild.id, {
        ...existing,
        codes: [...codes]
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `shop.code.${mode}`, value: `${item.itemKey}:${code}` });
      return respond.reply(message, 'good', `${mode === 'create' ? 'Added' : 'Removed'} code **${code}** ${mode === 'create' ? 'to' : 'from'} **${item.name}**.`);
    }

    if (sub === 'giftcard') {
      const mode = String(args.shift() || '').toLowerCase();
      const itemName = args.shift();
      const code = String(args.shift() || '').trim().toUpperCase();
      if (!['create', 'remove'].includes(mode) || !itemName || !code) {
        return respond.reply(message, 'info', 'Use `shop giftcard <create|remove> <item> <code> [amount]`.');
      }
      const existing = await getGuildShopItem(message.guild.id, itemName);
      if (!existing) return respond.reply(message, 'bad', 'I could not find that server shop item.');
      if (mode === 'create') {
        const amount = parseAmount(args.shift() || '1');
        const uses = parseAmount(args.shift() || '1');
        const card = await createGiftCode(message.guild.id, code, {
          itemKey: existing.itemKey,
          itemName: existing.name,
          usesRemaining: uses,
          amount
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'shop.giftcard.create', value: `${existing.itemKey}:${code}` });
        return respond.reply(message, 'good', `Created giftcard **${card.code}** for **${existing.name}** with **${settings.currencyIcon} ${formatCoins(card.amount)}** value.`);
      }
      const removed = await removeGiftCode(message.guild.id, code);
      if (!removed) return respond.reply(message, 'bad', 'I could not find that giftcard code.');
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'shop.giftcard.remove', value: `${existing.itemKey}:${code}` });
      return respond.reply(message, 'good', `Removed giftcard **${code}**.`);
    }

    const code = String(args.shift() || '').trim().toUpperCase();
    if (!code) {
      return respond.reply(message, 'info', 'Use `shop redeem <code>`.');
    }
    const gift = await useGiftCode(message.guild.id, code);
    if (!gift) return respond.reply(message, 'bad', 'That redeem code is invalid or already used up.');
    await require('../../systems/economy/store').addEarnings(message.guild.id, message.author.id, Number(gift.amount || 0), 'redeem', { code: gift.code, itemKey: gift.itemKey });
    await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'shop.redeem', value: code });
    return respond.reply(message, 'good', `Redeemed **${code}** for **${settings.currencyIcon} ${formatCoins(gift.amount)}** ${settings.currencyName}.${gift.itemName ? ` Item: **${gift.itemName}**.` : ''}`);
  }
};
