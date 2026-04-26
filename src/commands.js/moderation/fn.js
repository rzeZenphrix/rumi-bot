const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');

async function findMember(guild, input) {
  const id = extractId(input);
  if (id) return guild.members.fetch(id).catch(() => null);

  const query = String(input || '').toLowerCase();
  if (!query) return null;
  const cached = guild.members.cache.find((m) =>
    m.user.username.toLowerCase() === query ||
    m.user.tag.toLowerCase() === query ||
    (m.nickname || '').toLowerCase() === query
  );
  if (cached) return cached;

  const found = await guild.members.search({ query: input, limit: 1 }).catch(() => null);
  return found?.first?.() || null;
}

module.exports = {
  name: 'fn',
  aliases: ['forcenick', 'force-nick', 'nick', 'nickname'],
  category: 'moderation',
  description: 'Force change or reset a member nickname.',
  usage: 'fn <@user|id|name> <nickname|reset> [-force]',
  examples: ['fn @user bob', 'fn 123456789012345678 reset', 'fn @user -force New Nick'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const force = args.includes('-force') || args.includes('--force');
    args = args.filter((arg) => arg !== '-force' && arg !== '--force');

    const targetArg = args.shift();
    if (!targetArg || !args.length) {
      return respond.reply(message, 'info', 'Usage: `fn <@user|id|name> <nickname|reset> [-force]`.');
    }

    const member = await findMember(message.guild, targetArg);
    if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
    if (member.id === message.guild.ownerId) return respond.reply(message, 'bad', 'I cannot nickname the server owner.');
    if (!member.manageable) return respond.reply(message, 'bad', 'I cannot manage that member because of role hierarchy.');

    const nicknameRaw = args.join(' ').trim();
    const nickname = /^reset|null|none|remove$/i.test(nicknameRaw) ? null : nicknameRaw.slice(0, 32);

    await member.setNickname(nickname, `Force nickname by ${message.author.tag}${force ? ' (--force)' : ''}`);

    return respond.reply(
      message,
      'good',
      `${member} nickname ${nickname ? `changed to **${nickname}**` : 'reset'}.`
    );
  }
};
