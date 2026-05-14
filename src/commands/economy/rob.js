const respond = require('../../utils/respond');
const { findMember } = require('../../utils/memberResolver');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');
const { getAccount, parseAmount, transferCash, updateAccount, formatCoins } = require('../../systems/economy/store');

function remaining(seconds, last) {
  const left = Math.ceil((Number(last || 0) + seconds * 1000 - Date.now()) / 1000);
  if (left <= 0) return null;
  if (left >= 3600) return `${Math.ceil(left / 3600)}h`;
  if (left >= 60) return `${Math.ceil(left / 60)}m`;
  return `${left}s`;
}

module.exports = {
  name: 'rob',
  aliases: ['steal'],
  category: 'economy',
  description: 'Attempt to steal cash from another member.',
  usage: 'rob <member> [amount]',
  examples: ['rob @Rumi', 'rob @Rumi 100'],
  guildOnly: true,
  cooldown: 5,

  async execute({ message, args }) {
    if (!await isEconomyCommandEnabled(message.guild.id, 'rob')) {
      return respond.reply(message, 'bad', 'The rob command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    if (!settings.robEnabled) {
      return respond.reply(message, 'info', 'Robbing is disabled in this server economy.');
    }

    const target = await findMember(message.guild, args.shift()).catch(() => null);
    if (!target || target.user.bot || target.id === message.author.id) {
      return respond.reply(message, 'info', 'Use `rob <member> [amount]` with a real member.');
    }

    const robber = await getAccount(message.guild.id, message.author.id);
    const wait = remaining(settings.robCooldownSeconds, robber.lastRob);
    if (wait) return respond.reply(message, 'time', `You can rob again in **${wait}**.`);

    const victim = await getAccount(message.guild.id, target.id);
    const protectedUntil = Number(victim.robProtectedUntil || 0);
    if (protectedUntil > Date.now()) {
      return respond.reply(message, 'bad', `${target.displayName} is protected for now.`);
    }

    const requested = args[0] ? parseAmount(args[0], victim.cash) : Math.floor(settings.robMinAmount + Math.random() * (settings.robMaxAmount - settings.robMinAmount + 1));
    const amount = Math.max(settings.robMinAmount, Math.min(settings.robMaxAmount, requested, Number(victim.cash || 0)));
    if (!Number.isFinite(amount) || amount <= 0) return respond.reply(message, 'bad', 'That member does not have enough cash to rob.');

    const success = Math.random() * 100 < Number(settings.robSuccessRate || 35);
    await updateAccount(message.guild.id, message.author.id, (current) => {
      current.lastRob = Date.now();
      return current;
    });

    if (success) {
      const result = await transferCash(message.guild.id, target.id, message.author.id, amount, { taxRate: 0 });
      if (!result.ok) return respond.reply(message, 'bad', 'That robbery could not go through.');
      await updateAccount(message.guild.id, target.id, (current) => {
        current.robProtectedUntil = Date.now() + Number(settings.robProtectionHours || 0) * 60 * 60 * 1000;
        return current;
      });
      return respond.reply(message, 'good', `You stole **${formatCoins(amount)}** ${settings.currencyIcon} from ${target.displayName}.`);
    }

    const fine = Math.floor(amount * Number(settings.robFineRate || 0) / 100);
    if (fine > 0) await transferCash(message.guild.id, message.author.id, target.id, fine, { taxRate: 0 }).catch(() => null);
    return respond.reply(message, 'bad', `The robbery failed${fine > 0 ? ` and you paid **${formatCoins(fine)}** ${settings.currencyIcon}` : ''}.`);
  }
};
