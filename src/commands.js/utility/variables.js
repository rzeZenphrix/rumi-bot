const respond = require('../../utils/respond');
const { VARIABLES } = require('../../systems/variables/variableRegistry');

module.exports = {
  name: 'variables',
  aliases: ['vars', 'embedvars'],
  category: 'utility',
  description: 'Shows bot and embed variables.',
  usage: 'variables [search]',

  async execute({ message, args }) {
    const query = args.join(' ').trim().toLowerCase();

    const list = VARIABLES.filter((item) => {
      if (!query) return true;
      return item.name.includes(query) || item.description.toLowerCase().includes(query);
    }).slice(0, 100);

    const grouped = new Map();

    for (const item of list) {
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category).push(item);
    }

    return respond.reply(message, 'list', null, {
      description: `Showing **${list.length}** variables. Example fallback syntax: \`{user.name|Unknown}\`.`,
      fields: [...grouped.entries()].slice(0, 25).map(([category, vars]) => ({
        name: category,
        value: vars.map((v) => `\`${v.syntax}\` — ${v.description}`).join('\n').slice(0, 1024)
      }))
    });
  }
};