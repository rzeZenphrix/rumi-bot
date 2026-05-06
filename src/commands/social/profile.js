const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { getProfile } = require('../../systems/social/store');
const {
  renderProfileCard,
  attachment,
  hasCanvas
} = require('../../utils/socialCanvas');

async function resolveMember(message, user) {
  if (!message.guild || !user?.id) return null;
  return message.guild.members.fetch(user.id).catch(() => null);
}

module.exports = {
  name: 'profile',
  aliases: ['profileview', 'socialprofile', 'card'],
  category: 'social',
  description: 'Show a premium profile card for yourself or another user.',
  usage: 'profile [@user|user id]',
  examples: [
    'profile',
    'profile @Rumi',
    'profile 123456789012345678'
  ],
  slash: true,
  botPermissions: [
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks
  ],
  subcommands: [
    {
      name: 'view',
      description: 'Show a profile card.',
      usage: 'profile [@user]',
      examples: ['profile', 'profile @user']
    }
  ],

  async execute({ client, message, args }) {
    const user = args[0] ? await resolveUser(client, args[0]) : message.author;

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.', {
        mentionUser: false
      });
    }

    const profile = await getProfile(user.id);
    const member = await resolveMember(message, user);
    const buffer = await renderProfileCard(user, profile, member).catch(() => null);
    const file = attachment(buffer, 'rumi-profile.png');

    if (!file) {
      return respond.reply(message, 'info', null, {
        title: `${user.username}'s profile`,
        allowTitle: true,
        mentionUser: false,
        thumbnail: user.displayAvatarURL?.({ size: 256 }) || null,
        fields: [
          {
            name: 'Bio',
            value: profile.bio || 'No bio set yet.'
          },
          {
            name: 'Karma',
            value: String(profile.karma || 0),
            inline: true
          },
          {
            name: 'Streak',
            value: String(profile.streak || 0),
            inline: true
          },
          {
            name: 'Leaderboard',
            value: profile.hideLeaderboard ? 'Hidden' : 'Visible',
            inline: true
          },
          {
            name: 'Links',
            value: profile.socialLinks?.length
              ? profile.socialLinks.join('\n').slice(0, 1024)
              : 'No links saved.'
          }
        ],
        footer: {
          text: hasCanvas()
            ? 'Rumi Profile'
            : 'Install @napi-rs/canvas to enable premium profile cards.'
        }
      });
    }

    return message.channel.send({
      files: [file],
      allowedMentions: { parse: [] }
    });
  }
};