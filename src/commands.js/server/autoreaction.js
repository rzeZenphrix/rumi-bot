const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { findMember } = require('../../utils/memberResolver');
const { findRole } = require('../../utils/roleResolver');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const {
  parseAutomationFlags,
  listAutoreactions,
  getAutoreaction,
  upsertAutoreaction,
  removeAutoreaction,
  listAutoreactionExclusives,
  addAutoreactionExclusive,
  removeAutoreactionExclusive
} = require('../../systems/automation/messageAutomation');

async function resolveTarget(guild, input) {
  const mentionedChannel = guild.channels.cache.find((channel) => channel.toString() === input);
  if (mentionedChannel) return { type: 'channel', id: mentionedChannel.id, label: mentionedChannel.toString() };

  const channelId = String(input || '').match(/^<#(\d{17,20})>$/)?.[1] || String(input || '').match(/^(\d{17,20})$/)?.[1];
  const channel = channelId
    ? guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)
    : guild.channels.cache.find((entry) => entry.name.toLowerCase() === String(input || '').toLowerCase());
  if (channel) return { type: 'channel', id: channel.id, label: channel.toString() };

  const role = await findRole(guild, input);
  if (role) return { type: 'role', id: role.id, label: role.toString() };

  const member = await findMember(guild, input);
  if (member) return { type: 'user', id: member.id, label: member.toString() };

  return null;
}

module.exports = {
  name: 'autoreaction',
  aliases: ['autorea', 'autoreact'],
  category: 'server',
  description: 'Create automatic emoji reactions with scoped exclusives.',
  usage: 'autoreaction <add|list|remove|exclusive> ...',
  examples: [
    'autoreaction add "good morning" ☀️ ❤️ --startswith',
    'autoreaction exclusive set <id> #general'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const action = String(args.shift() || 'list').toLowerCase();
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const limit = access?.hasServerPremiumBase ? 500 : 50;

    if (action === 'add' || action === 'set') {
      const trigger = args.shift();
      if (!trigger) {
        return respond.reply(message, 'info', 'Use `autoreaction add "<trigger>" <emoji...> [flags]`.', { mentionUser: false });
      }

      const { options, leftovers } = parseAutomationFlags(args);
      const reactions = leftovers.filter(Boolean);
      if (!reactions.length) {
        return respond.reply(message, 'info', 'Give me at least one emoji reaction to attach.', { mentionUser: false });
      }

      const entries = await listAutoreactions(message.guild.id).catch(() => []);
      if (entries.length >= limit) {
        return respond.reply(
          message,
          'bad',
          access?.hasServerPremiumBase
            ? `You already used all ${limit} autoreaction slots.`
            : 'Free servers can configure up to 50 autoreactions. Server premium raises that to 500.'
        );
      }

      const saved = await upsertAutoreaction({
        guild_id: message.guild.id,
        trigger_text: trigger,
        reactions_json: reactions,
        match_mode: options.matchMode,
        within_seconds: options.withinSeconds,
        enabled: true,
        created_by: message.author.id
      });

      return respond.reply(message, 'good', `Saved autoreaction \`${saved.id}\`.`);
    }

    if (action === 'list' || action === 'view') {
      const entries = await listAutoreactions(message.guild.id).catch(() => []);
      const description = entries.length
        ? entries
            .map((entry) => {
              const flags = [
                entry.match_mode,
                entry.within_seconds ? `within ${entry.within_seconds}s` : null
              ].filter(Boolean).join(' | ');
              return `**${entry.id}**\nTrigger: \`${entry.trigger_text}\`\nReactions: ${(entry.reactions_json || []).join(' ')}\nMode: ${flags}`;
            })
            .join('\n\n')
            .slice(0, 4096)
        : `No autoreactions are configured yet. (${0}/${limit})`;

      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Autoreactions',
        mentionUser: false,
        description
      });
    }

    if (action === 'remove' || action === 'delete') {
      const entryId = String(args.shift() || '').trim();
      if (!entryId) {
        return respond.reply(message, 'info', 'Use `autoreaction remove <id>`.', { mentionUser: false });
      }
      await removeAutoreaction(message.guild.id, entryId).catch(() => null);
      return respond.reply(message, 'good', `Removed autoreaction \`${entryId}\`.`);
    }

    if (action === 'exclusive') {
      const sub = String(args.shift() || 'list').toLowerCase();

      if (sub === 'list' || sub === 'view') {
        const entryId = String(args.shift() || '').trim();
        const exclusives = await listAutoreactionExclusives(message.guild.id, entryId || null).catch(() => []);
        const description = exclusives.length
          ? exclusives.map((entry) => `**${entry.autoreaction_id}** - ${entry.target_type}: \`${entry.target_id}\``).join('\n')
          : 'No autoreaction exclusives are configured.';
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Autoreaction exclusives',
          mentionUser: false,
          description
        });
      }

      const entryId = String(args.shift() || '').trim();
      const entry = await getAutoreaction(message.guild.id, entryId).catch(() => null);
      if (!entry) {
        return respond.reply(message, 'bad', 'That autoreaction ID could not be found.');
      }

      const target = await resolveTarget(message.guild, args.join(' '));
      if (!target) {
        return respond.reply(message, 'info', 'Use `autoreaction exclusive <set|remove> <id> <role|channel|user>`.', {
          mentionUser: false
        });
      }

      if (sub === 'set' || sub === 'add') {
        await addAutoreactionExclusive(message.guild.id, entry.id, target.type, target.id);
        return respond.reply(message, 'good', `Added an exclusive ${target.type} target for \`${entry.id}\`: ${target.label}`);
      }

      if (sub === 'remove' || sub === 'delete') {
        await removeAutoreactionExclusive(message.guild.id, entry.id, target.type, target.id).catch(() => null);
        return respond.reply(message, 'good', `Removed the exclusive ${target.type} target for \`${entry.id}\`.`);
      }
    }

    return respond.reply(message, 'info', 'Use `autoreaction <add|list|remove|exclusive>`.', { mentionUser: false });
  }
};
