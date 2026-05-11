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

function shortenId(id) {
  const value = String(id || '');
  return value.length <= 10 ? value : value.slice(0, 8);
}

function resolveEntryReference(entries, input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const index = Number(raw);
    if (index >= 1 && index <= entries.length) {
      return entries[index - 1];
    }
  }

  const lowered = raw.toLowerCase();
  const exactId = entries.find((entry) => String(entry.id) === raw);
  if (exactId) return exactId;

  const prefixMatches = entries.filter((entry) => String(entry.id || '').toLowerCase().startsWith(lowered));
  if (prefixMatches.length === 1) return prefixMatches[0];

  const exactTrigger = entries.find((entry) => String(entry.trigger_text || '').toLowerCase() === lowered);
  if (exactTrigger) return exactTrigger;

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
    'autoreaction exclusive set 1 #general'
  ],
  flags: [
    { name: '--exact', description: 'Trigger must match the whole message.' },
    { name: '--startswith', description: 'Trigger must be at the start of the message.' },
    { name: '--endswith', description: 'Trigger must be at the end of the message.' },
    { name: '--contains', description: 'Trigger can appear anywhere in the message.' },
    { name: '--match', description: 'Treat trigger as a regex pattern.' },
    { name: '--within <duration>', description: 'Per-user cooldown window (e.g., 30s, 5m).' }
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

      return respond.reply(message, 'good', `Saved autoreaction \`#${entries.length + 1}\` (\`${shortenId(saved.id)}\`).`);
    }

    if (action === 'list' || action === 'view') {
      const entries = await listAutoreactions(message.guild.id).catch(() => []);
      const description = entries.length
        ? entries
            .map((entry, index) => {
              const flags = [
                entry.match_mode,
                entry.within_seconds ? `within ${entry.within_seconds}s` : null
              ].filter(Boolean).join(' | ');
              return `**#${index + 1}** \`${shortenId(entry.id)}\`\nTrigger: \`${entry.trigger_text}\`\nReactions: ${(entry.reactions_json || []).join(' ')}\nMode: ${flags}`;
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
      const entryRef = String(args.shift() || '').trim();
      if (!entryRef) {
        return respond.reply(message, 'info', 'Use `autoreaction remove <slot|id|trigger>`.', { mentionUser: false });
      }
      const entries = await listAutoreactions(message.guild.id).catch(() => []);
      const entry = resolveEntryReference(entries, entryRef);
      if (!entry) {
        return respond.reply(message, 'bad', 'That autoreaction reference could not be found.');
      }
      await removeAutoreaction(message.guild.id, entry.id).catch(() => null);
      return respond.reply(message, 'good', `Removed autoreaction \`#${entries.indexOf(entry) + 1}\` (\`${shortenId(entry.id)}\`).`);
    }

    if (action === 'exclusive') {
      const sub = String(args.shift() || 'list').toLowerCase();

      if (sub === 'list' || sub === 'view') {
        const entryRef = String(args.shift() || '').trim();
        const entries = await listAutoreactions(message.guild.id).catch(() => []);
        const entry = entryRef ? resolveEntryReference(entries, entryRef) : null;
        if (entryRef && !entry) {
          return respond.reply(message, 'bad', 'That autoreaction reference could not be found.');
        }

        const exclusives = await listAutoreactionExclusives(message.guild.id, entry?.id || null).catch(() => []);
        const description = exclusives.length
          ? exclusives.map((exclusive) => {
            const owner = entries.find((item) => item.id === exclusive.autoreaction_id);
            const slot = owner ? `#${entries.indexOf(owner) + 1}` : shortenId(exclusive.autoreaction_id);
            return `**${slot}** - ${exclusive.target_type}: \`${exclusive.target_id}\``;
          }).join('\n')
          : 'No autoreaction exclusives are configured.';
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Autoreaction exclusives',
          mentionUser: false,
          description
        });
      }

      const entryRef = String(args.shift() || '').trim();
      const entries = await listAutoreactions(message.guild.id).catch(() => []);
      const resolved = resolveEntryReference(entries, entryRef);
      const entry = resolved
        ? await getAutoreaction(message.guild.id, resolved.id).catch(() => null)
        : null;
      if (!entry) {
        return respond.reply(message, 'bad', 'That autoreaction reference could not be found.');
      }

      const target = await resolveTarget(message.guild, args.join(' '));
      if (!target) {
        return respond.reply(message, 'info', 'Use `autoreaction exclusive <set|remove> <slot|id|trigger> <role|channel|user>`.', {
          mentionUser: false
        });
      }

      if (sub === 'set' || sub === 'add') {
        await addAutoreactionExclusive(message.guild.id, entry.id, target.type, target.id);
        return respond.reply(message, 'good', `Added an exclusive ${target.type} target for \`#${entries.indexOf(resolved) + 1}\`: ${target.label}`);
      }

      if (sub === 'remove' || sub === 'delete') {
        await removeAutoreactionExclusive(message.guild.id, entry.id, target.type, target.id).catch(() => null);
        return respond.reply(message, 'good', `Removed the exclusive ${target.type} target for \`#${entries.indexOf(resolved) + 1}\`.`);
      }
    }

    return respond.reply(message, 'info', 'Use `autoreaction <add|list|remove|exclusive>`.', { mentionUser: false });
  }
};
