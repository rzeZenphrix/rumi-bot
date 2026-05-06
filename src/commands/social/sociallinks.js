const respond = require('../../utils/respond');
const { getProfile, updateProfile } = require('../../systems/social/store');

function isUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

module.exports = {
  name: 'sociallinks',
  aliases: ['links', 'socials'],
  category: 'social',
  description: 'Manage social profile links.',
  usage: 'sociallinks <add|remove|list> [url|index]',

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'list') {
      const profile = await getProfile(message.author.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: profile.socialLinks?.length
          ? `**Your social links**\n${profile.socialLinks.map((link, index) => `${index + 1}. ${link}`).join('\n')}`
          : 'You have not saved any social links yet.'
      });
    }

    if (sub === 'add') {
      const url = args.shift();
      if (!isUrl(url)) return respond.reply(message, 'bad', 'I need a valid URL.');
      const profile = await updateProfile(message.author.id, (draft) => {
        if (!draft.socialLinks.includes(url)) draft.socialLinks.push(url);
        return draft;
      });
      return respond.reply(message, 'good', `Saved that social link. You now have **${profile.socialLinks.length}** link(s).`);
    }

    if (sub === 'remove') {
      const token = args.shift();
      const profile = await getProfile(message.author.id);
      const index = Number(token);
      const target = Number.isInteger(index) && index > 0
        ? profile.socialLinks[index - 1]
        : token;

      if (!target) return respond.reply(message, 'info', 'Use `sociallinks remove <url|index>`.');

      const updated = await updateProfile(message.author.id, (draft) => {
        draft.socialLinks = draft.socialLinks.filter((link) => link !== target);
        return draft;
      });
      return respond.reply(message, 'good', `Removed that social link. You now have **${updated.socialLinks.length}** link(s).`);
    }

    return respond.reply(message, 'info', 'Use `sociallinks add <url>`, `sociallinks remove <url|index>`, or `sociallinks list`.');
  }
};
