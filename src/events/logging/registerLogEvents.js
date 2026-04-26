const { Events, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');

function userField(user) {
  if (!user) return 'Unknown';
  return `${user.tag || user.username || user.id}\n\`${user.id}\``;
}

function channelField(channel) {
  if (!channel) return 'Unknown';
  return `${channel.name ? `#${channel.name}` : channel.id}\n\`${channel.id}\``;
}

async function recentAudit(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  const now = Date.now();

  return logs?.entries?.find((entry) => {
    const recent = Math.abs(now - entry.createdTimestamp) < 15000;
    const targetMatches = !targetId || entry.target?.id === targetId;
    return recent && targetMatches;
  }) || null;
}

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    client.on(Events.MessageDelete, async (message) => {
      if (!message.guild || message.partial || message.author?.bot) return;

      await sendLog(message.guild, 'messageDelete', {
        title: 'Message deleted',
        description: message.content?.slice(0, 3900) || '*No text content.*',
        channelId: message.channel.id,
        userId: message.author?.id,
        fields: [
          { name: 'Author', value: userField(message.author), inline: true },
          { name: 'Channel', value: channelField(message.channel), inline: true },
          { name: 'Message ID', value: `\`${message.id}\``, inline: true },
          { name: 'Attachments', value: String(message.attachments?.size || 0), inline: true }
        ],
        thumbnail: message.author?.displayAvatarURL?.()
      });
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
      if (!oldMessage.guild || oldMessage.partial || newMessage.partial || oldMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;

      await sendLog(oldMessage.guild, 'messageUpdate', {
        title: 'Message edited',
        description: `[Jump to message](${newMessage.url})`,
        channelId: oldMessage.channel.id,
        userId: oldMessage.author.id,
        fields: [
          { name: 'Author', value: userField(oldMessage.author), inline: true },
          { name: 'Channel', value: channelField(oldMessage.channel), inline: true },
          { name: 'Before', value: oldMessage.content?.slice(0, 1024) || '*Empty*' },
          { name: 'After', value: newMessage.content?.slice(0, 1024) || '*Empty*' }
        ],
        thumbnail: oldMessage.author.displayAvatarURL()
      });
    });

    client.on(Events.MessageBulkDelete, async (messages, channel) => {
      const guild = channel.guild;
      if (!guild) return;

      await sendLog(guild, 'messageBulkDelete', {
        title: 'Bulk messages deleted',
        description: `**${messages.size}** messages were bulk deleted.`,
        channelId: channel.id,
        fields: [
          { name: 'Channel', value: channelField(channel), inline: true },
          { name: 'Count', value: String(messages.size), inline: true }
        ]
      });
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      await sendLog(member.guild, 'memberJoin', {
        title: 'Member joined',
        description: `${member} joined the server.`,
        userId: member.id,
        member,
        fields: [
          { name: 'User', value: userField(member.user), inline: true },
          { name: 'Account created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        ],
        thumbnail: member.user.displayAvatarURL()
      });
    });

    client.on(Events.GuildMemberRemove, async (member) => {
      await sendLog(member.guild, 'memberLeave', {
        title: 'Member left',
        description: `${member.user?.tag || member.id} left the server.`,
        userId: member.id,
        fields: [
          { name: 'User', value: userField(member.user), inline: true },
          { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }
        ],
        thumbnail: member.user?.displayAvatarURL?.()
      });
    });

    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      const changes = [];

      if (oldMember.nickname !== newMember.nickname) {
        changes.push(`Nickname: **${oldMember.nickname || oldMember.user.username}** → **${newMember.nickname || newMember.user.username}**`);
      }

      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;
      const added = newRoles.filter((role) => !oldRoles.has(role.id));
      const removed = oldRoles.filter((role) => !newRoles.has(role.id));

      if (added.size) changes.push(`Roles added: ${added.map((r) => `<@&${r.id}>`).join(', ')}`);
      if (removed.size) changes.push(`Roles removed: ${removed.map((r) => `<@&${r.id}>`).join(', ')}`);

      if (!changes.length) return;

      await sendLog(newMember.guild, 'memberUpdate', {
        title: 'Member updated',
        description: changes.join('\n').slice(0, 3900),
        userId: newMember.id,
        member: newMember,
        fields: [{ name: 'Member', value: userField(newMember.user), inline: true }],
        thumbnail: newMember.user.displayAvatarURL()
      });
    });

    client.on(Events.GuildBanAdd, async (ban) => {
      const audit = await recentAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);

      await sendLog(ban.guild, 'memberBan', {
        title: 'Member banned',
        description: `${ban.user.tag || ban.user.id} was banned.`,
        userId: ban.user.id,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'User', value: userField(ban.user), inline: true },
          { name: 'Moderator', value: userField(audit?.executor), inline: true },
          { name: 'Reason', value: audit?.reason || 'No reason provided.' }
        ],
        thumbnail: ban.user.displayAvatarURL()
      });
    });

    client.on(Events.GuildBanRemove, async (ban) => {
      const audit = await recentAudit(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);

      await sendLog(ban.guild, 'memberUnban', {
        title: 'Member unbanned',
        description: `${ban.user.tag || ban.user.id} was unbanned.`,
        userId: ban.user.id,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'User', value: userField(ban.user), inline: true },
          { name: 'Moderator', value: userField(audit?.executor), inline: true },
          { name: 'Reason', value: audit?.reason || 'No reason provided.' }
        ],
        thumbnail: ban.user.displayAvatarURL()
      });
    });

    client.on(Events.GuildRoleCreate, async (role) => {
      const audit = await recentAudit(role.guild, AuditLogEvent.RoleCreate, role.id);

      await sendLog(role.guild, 'roleCreate', {
        title: 'Role created',
        description: `Role <@&${role.id}> was created.`,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Role', value: `${role.name}\n\`${role.id}\``, inline: true },
          { name: 'Created by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.GuildRoleDelete, async (role) => {
      const audit = await recentAudit(role.guild, AuditLogEvent.RoleDelete, role.id);

      await sendLog(role.guild, 'roleDelete', {
        title: 'Role deleted',
        description: `Role **${role.name}** was deleted.`,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          { name: 'Deleted by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
      const changes = [];

      if (oldRole.name !== newRole.name) changes.push(`Name: **${oldRole.name}** → **${newRole.name}**`);
      if (oldRole.color !== newRole.color) changes.push(`Color: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      if (oldRole.hoist !== newRole.hoist) changes.push(`Hoist: \`${oldRole.hoist}\` → \`${newRole.hoist}\``);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: \`${oldRole.mentionable}\` → \`${newRole.mentionable}\``);

      if (!changes.length) return;

      const audit = await recentAudit(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

      await sendLog(newRole.guild, 'roleUpdate', {
        title: 'Role updated',
        description: changes.join('\n'),
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Role', value: `<@&${newRole.id}>\n\`${newRole.id}\``, inline: true },
          { name: 'Updated by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.ChannelCreate, async (channel) => {
      if (!channel.guild) return;
      const audit = await recentAudit(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

      await sendLog(channel.guild, 'channelCreate', {
        title: 'Channel created',
        description: `${channel} was created.`,
        channelId: channel.id,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Channel', value: channelField(channel), inline: true },
          { name: 'Created by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.ChannelDelete, async (channel) => {
      if (!channel.guild) return;
      const audit = await recentAudit(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

      await sendLog(channel.guild, 'channelDelete', {
        title: 'Channel deleted',
        description: `Channel **${channel.name || channel.id}** was deleted.`,
        channelId: channel.id,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
          { name: 'Deleted by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
      if (!newChannel.guild) return;

      const changes = [];

      if (oldChannel.name !== newChannel.name) changes.push(`Name: **${oldChannel.name}** → **${newChannel.name}**`);
      if (oldChannel.topic !== newChannel.topic) changes.push(`Topic changed.`);
      if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: \`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\``);

      if (!changes.length) return;

      const audit = await recentAudit(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);

      await sendLog(newChannel.guild, 'channelUpdate', {
        title: 'Channel updated',
        description: changes.join('\n'),
        channelId: newChannel.id,
        actorId: audit?.executor?.id,
        fields: [
          { name: 'Channel', value: channelField(newChannel), inline: true },
          { name: 'Updated by', value: userField(audit?.executor), inline: true }
        ]
      });
    });

    client.on(Events.GuildEmojiCreate, async (emoji) => {
      await sendLog(emoji.guild, 'emojiCreate', {
        title: 'Emoji created',
        description: `${emoji} **${emoji.name}** was created.`,
        fields: [{ name: 'Emoji ID', value: `\`${emoji.id}\``, inline: true }]
      });
    });

    client.on(Events.GuildEmojiDelete, async (emoji) => {
      await sendLog(emoji.guild, 'emojiDelete', {
        title: 'Emoji deleted',
        description: `Emoji **${emoji.name}** was deleted.`,
        fields: [{ name: 'Emoji ID', value: `\`${emoji.id}\``, inline: true }]
      });
    });

    client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
      if (oldEmoji.name === newEmoji.name) return;

      await sendLog(newEmoji.guild, 'emojiUpdate', {
        title: 'Emoji updated',
        description: `${newEmoji} was renamed from **${oldEmoji.name}** to **${newEmoji.name}**.`,
        fields: [{ name: 'Emoji ID', value: `\`${newEmoji.id}\``, inline: true }]
      });
    });

    client.on(Events.GuildStickerCreate, async (sticker) => {
      await sendLog(sticker.guild, 'stickerCreate', {
        title: 'Sticker created',
        description: `Sticker **${sticker.name}** was created.`,
        fields: [{ name: 'Sticker ID', value: `\`${sticker.id}\``, inline: true }]
      });
    });

    client.on(Events.GuildStickerDelete, async (sticker) => {
      await sendLog(sticker.guild, 'stickerDelete', {
        title: 'Sticker deleted',
        description: `Sticker **${sticker.name}** was deleted.`,
        fields: [{ name: 'Sticker ID', value: `\`${sticker.id}\``, inline: true }]
      });
    });

    client.on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
      await sendLog(newSticker.guild, 'stickerUpdate', {
        title: 'Sticker updated',
        description: `Sticker **${oldSticker.name}** was updated.`,
        fields: [
          { name: 'Before', value: oldSticker.name || 'Unknown', inline: true },
          { name: 'After', value: newSticker.name || 'Unknown', inline: true }
        ]
      });
    });

    client.on(Events.InviteCreate, async (invite) => {
      await sendLog(invite.guild, 'inviteCreate', {
        title: 'Invite created',
        description: `Invite \`${invite.code}\` was created.`,
        channelId: invite.channel?.id,
        userId: invite.inviter?.id,
        fields: [
          { name: 'Code', value: `\`${invite.code}\``, inline: true },
          { name: 'Channel', value: channelField(invite.channel), inline: true },
          { name: 'Inviter', value: userField(invite.inviter), inline: true }
        ]
      });
    });

    client.on(Events.InviteDelete, async (invite) => {
      await sendLog(invite.guild, 'inviteDelete', {
        title: 'Invite deleted',
        description: `Invite \`${invite.code}\` was deleted.`,
        channelId: invite.channel?.id,
        fields: [
          { name: 'Code', value: `\`${invite.code}\``, inline: true },
          { name: 'Channel', value: channelField(invite.channel), inline: true }
        ]
      });
    });

    client.on(Events.WebhooksUpdate, async (channel) => {
      if (!channel.guild) return;

      await sendLog(channel.guild, 'webhookUpdate', {
        title: 'Webhooks updated',
        description: `Webhooks were updated in ${channel}.`,
        channelId: channel.id,
        fields: [{ name: 'Channel', value: channelField(channel), inline: true }]
      });
    });

    client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
      const changes = [];

      if (oldGuild.name !== newGuild.name) changes.push(`Name: **${oldGuild.name}** → **${newGuild.name}**`);
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`Verification level changed.`);

      if (!changes.length) return;

      await sendLog(newGuild, 'guildUpdate', {
        title: 'Server updated',
        description: changes.join('\n')
      });
    });

    client.on(Events.ThreadCreate, async (thread) => {
      await sendLog(thread.guild, 'threadCreate', {
        title: 'Thread created',
        description: `${thread} was created.`,
        channelId: thread.parentId,
        fields: [{ name: 'Thread', value: `${thread.name}\n\`${thread.id}\``, inline: true }]
      });
    });

    client.on(Events.ThreadDelete, async (thread) => {
      await sendLog(thread.guild, 'threadDelete', {
        title: 'Thread deleted',
        description: `Thread **${thread.name}** was deleted.`,
        channelId: thread.parentId,
        fields: [{ name: 'Thread ID', value: `\`${thread.id}\``, inline: true }]
      });
    });

    client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
      if (oldThread.name === newThread.name && oldThread.archived === newThread.archived) return;

      await sendLog(newThread.guild, 'threadUpdate', {
        title: 'Thread updated',
        description: `Thread **${newThread.name}** was updated.`,
        channelId: newThread.parentId,
        fields: [
          { name: 'Before', value: oldThread.name || 'Unknown', inline: true },
          { name: 'After', value: newThread.name || 'Unknown', inline: true }
        ]
      });
    });

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      if (oldState.channelId === newState.channelId) return;

      const guild = newState.guild || oldState.guild;
      const member = newState.member || oldState.member;

      await sendLog(guild, 'voiceStateUpdate', {
        title: 'Voice state updated',
        description: `${member?.user?.tag || member?.id} changed voice channel.`,
        userId: member?.id,
        fields: [
          { name: 'Member', value: userField(member?.user), inline: true },
          { name: 'Old channel', value: oldState.channel ? channelField(oldState.channel) : 'None', inline: true },
          { name: 'New channel', value: newState.channel ? channelField(newState.channel) : 'None', inline: true }
        ],
        thumbnail: member?.user?.displayAvatarURL?.()
      });
    });
  }
};