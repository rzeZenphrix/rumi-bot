const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp', 'useravatar'],
  category: 'info',
  description: 'Show a user global avatar.',
  usage: 'avatar [user]',
  examples: ['avatar', 'avatar @user', 'avatar 123456789012345678'],

  async execute({ client, message, args }) {
    const user = args[0]
      ? await resolveUser(client, args[0])
      : message.author;

    if (!user) return respond.reply(message, 'bad', 'I could not find that user.');

    const url = user.displayAvatarURL({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    return respond.reply(message, 'info', null, {
      title: `${user.tag || user.username}'s avatar`,
      description: `[Open avatar](${url})`,
      image: url
    });
  }
};