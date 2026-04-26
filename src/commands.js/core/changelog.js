const respond = require('../../utils/respond');
const pkg = require('../../../package.json');
module.exports = {
  name: 'changelog', aliases: ['changes', 'updates'], category: 'core',
  description: 'I show recent bot changes.', usage: 'changelog', examples: ['changelog'],
  async execute({ message }) {
    return respond.reply(message, '', null, { description: `**Recent changes & updates**\n**v${pkg.version}**\n• I added more utility, moderation, community, fun, and info commands.\n• I simplified reply embed styling.\n• I improved webhook logging descriptions.\n• I added more Supabase-backed lightweight storage features.` });
  }
};
