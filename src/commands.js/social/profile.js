const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { getProfile } = require('../../systems/social/store');

module.exports = {
  name: 'profile',
  aliases: ['profileview'],
  category: 'social',
  description: 'Show a simple profile card.',
  usage: 'profile [@user]',

  async execute({ client, message, args }) {
    const user = args[0] ? await resolveUser(client, args[0]) : message.author;
    if (!user) return respond.reply(message, 'bad', 'I could not find that user.');

    const profile = await getProfile(user.id);
    return respond.reply(message, 'info', null, {
      title: `${user.username}'s profile`,
      thumbnail: user.displayAvatarURL?.({ size: 256 }) || null,
      fields: [
        { name: 'Bio', value: profile.bio || 'No bio set yet.' },
        { name: 'Karma', value: String(profile.karma || 0), inline: true },
        { name: 'Streak', value: String(profile.streak || 0), inline: true },
        { name: 'Links', value: profile.socialLinks?.length ? profile.socialLinks.join('\n').slice(0, 1024) : 'No links saved.' }
      ]
    });
  }
};
