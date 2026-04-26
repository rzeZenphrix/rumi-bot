const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
  name: 'banner',
  aliases: ['ubanner', 'userbanner'],
  category: 'info',
  description: 'Show a user global banner.',
  usage: 'banner [user]',
  examples: ['banner', 'banner @user', 'banner 123456789012345678'],

  async execute({ client, message, args }) {
    const baseUser = args[0]
      ? await resolveUser(client, args[0])
      : message.author;

    if (!baseUser) return respond.reply(message, 'bad', 'I could not find that user.');

    const user = await client.users.fetch(baseUser.id, { force: true }).catch(() => baseUser);

    const url = user.bannerURL?.({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    if (!url) return respond.reply(message, 'bad', 'That user does not have a visible global banner.');

    return respond.reply(message, 'info', null, {
      title: `${user.tag || user.username}'s banner`,
      description: `[Open banner](${url})`,
      image: url
    });
  }
};