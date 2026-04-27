const respond = require('../../utils/respond');
const { getAccount } = require('../../systems/economy/store');

function describeItem(item) {
  if (item.type === 'vape') {
    return `**Vape** - durability \`${item.durability}\`, juice \`${item.juice}\`, status \`${item.status}\``;
  }
  const name = item.displayName || item.type;
  return `**${name}**${item.kind === 'guild' ? ' - server item' : ''}${item.rarity ? ` - ${item.rarity}` : ''}${item.status && item.status !== 'active' ? ` - ${item.status}` : ''}`;
}

module.exports = {
  name: 'inventory',
  aliases: ['inv'],
  category: 'economy',
  description: 'Check inventory.',
  usage: 'inventory',
  examples: ['inventory'],
  guildOnly: true,

  async execute({ message }) {
    const account = await getAccount(message.guild.id, message.author.id);
    const items = (account.inventory || []).filter((item) => item.status !== 'sold');

    return respond.reply(message, 'info', null, {
      description: `${items.length ? items.map((item, index) => `${index + 1}. ${describeItem(item)}`).join('\n') : 'I do not see any items in your inventory yet.'}`,
      mentionUser: false
    });
  }
};
