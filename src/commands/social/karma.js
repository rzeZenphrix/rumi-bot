const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { getProfile, updateProfile } = require('../../systems/social/store');

const KARMA_COOLDOWN_MS = 12 * 60 * 60 * 1000;

module.exports = {
  name: 'karma',
  aliases: ['repkarma'],
  category: 'social',
  description: 'Give or view karma.',
  usage: 'karma [@user]',

  async execute({ client, message, args }) {
    const target = args[0] ? await resolveUser(client, args[0]) : null;

    if (!target) {
      const profile = await getProfile(message.author.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: `${message.author} has **${profile.karma || 0}** karma.`
      });
    }

    if (target.id === message.author.id) {
      return respond.reply(message, 'bad', 'You cannot give karma to yourself.');
    }

    const giver = await getProfile(message.author.id);
    if (giver.lastKarmaGivenAt && Date.now() - giver.lastKarmaGivenAt < KARMA_COOLDOWN_MS) {
      return respond.reply(message, 'bad', 'You already gave karma recently.');
    }

    await updateProfile(message.author.id, (profile) => {
      profile.lastKarmaGivenAt = Date.now();
      return profile;
    });

    const updated = await updateProfile(target.id, (profile) => {
      profile.karma = Number(profile.karma || 0) + 1;
      return profile;
    });

    return respond.reply(message, 'good', `Gave karma to ${target}. They now have **${updated.karma}** karma.`);
  }
};
