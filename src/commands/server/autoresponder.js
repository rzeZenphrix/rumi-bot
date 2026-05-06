const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { findMember } = require('../../utils/memberResolver');
const { findRole } = require('../../utils/roleResolver');
const { getPremiumAccessForMessage, requireServerPremium } = require('../../systems/monetization/access');
const {
  parseAutomationFlags,
  listAutoresponders,
  getAutoresponder,
  upsertAutoresponder,
  removeAutoresponder,
  listAutoresponderExclusives,
  addAutoresponderExclusive,
  removeAutoresponderExclusive
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
  name: 'autoresponder',
  aliases: ['arsp', 'autoresponse'],
  category: 'server',
  description: 'Create advanced automatic text responses with match flags and scoped exclusives.',
  usage: 'autoresponder <set|list|remove|exclusive> ...',
  examples: [
    'autoresponder set "hello there" "general kenobi" --exact',
    'autoresponder set "hola" "hi there" --languagedetect',
    'autoresponder exclusive set 1 #general'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  subcommands: [
    {
      name: 'set',
      description: 'Create an autoresponder.',
      usage: 'autoresponder set "<trigger>" "<response>" [--exact|--startswith|--endswith|--contains|--match|--within <duration>|--languagedetect]',
      examples: ['autoresponder set "hello" "hi!" --exact']
    }
  ],

  async execute({ message, args }) {
    const action = String(args.shift() || 'list').toLowerCase();
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const limit = access?.hasServerPremiumBase ? 500 : 50;

    if (action === 'set' || action === 'add') {
      const trigger = args.shift();
      const responseText = args.shift();
      if (!trigger || !responseText) {
        return respond.reply(message, 'info', 'Use `autoresponder set "<trigger>" "<response>" [flags]`.', { mentionUser: false });
      }

      const { options } = parseAutomationFlags(args);
      if (options.languageDetect) {
        const premium = await requireServerPremium(message, 'Language-detect autoresponders');
        if (!premium) return null;
      }

      const entries = await listAutoresponders(message.guild.id).catch(() => []);
      if (entries.length >= limit) {
        return respond.reply(
          message,
          'bad',
          access?.hasServerPremiumBase
            ? `You already used all ${limit} autoresponder slots.`
            : 'Free servers can configure up to 50 autoresponders. Server premium raises that to 500.'
        );
      }

      const saved = await upsertAutoresponder({
        guild_id: message.guild.id,
        trigger_text: trigger,
        response_text: responseText,
        match_mode: options.matchMode,
        within_seconds: options.withinSeconds,
        language_detect: options.languageDetect,
        enabled: true,
        created_by: message.author.id
      });

      return respond.reply(message, 'good', `Saved autoresponder \`${saved.id}\`.`);
    }

    if (action === 'list' || action === 'view') {
      const entries = await listAutoresponders(message.guild.id).catch(() => []);
      const description = entries.length
        ? entries
            .map((entry) => {
              const flags = [
                entry.match_mode,
                entry.within_seconds ? `within ${entry.within_seconds}s` : null,
                entry.language_detect ? 'language-detect' : null
              ].filter(Boolean).join(' | ');
              return `**#${entries.indexOf(entry) + 1}** \`${shortenId(entry.id)}\`\nTrigger: \`${entry.trigger_text}\`\nMode: ${flags}`;
            })
            .join('\n\n')
            .slice(0, 4096)
        : `No autoresponders are configured yet. (${0}/${limit})`;

      return respond.reply(message, 'info', null, {
        allowTitle: true,
        title: 'Autoresponders',
        mentionUser: false,
        description
      });
    }

    if (action === 'remove' || action === 'delete') {
      const entryRef = String(args.shift() || '').trim();
      if (!entryRef) {
        return respond.reply(message, 'info', 'Use `autoresponder remove <slot|id|trigger>`.', { mentionUser: false });
      }
      const entries = await listAutoresponders(message.guild.id).catch(() => []);
      const entry = resolveEntryReference(entries, entryRef);
      if (!entry) {
        return respond.reply(message, 'bad', 'That autoresponder reference could not be found.');
      }
      await removeAutoresponder(message.guild.id, entry.id).catch(() => null);
      return respond.reply(message, 'good', `Removed autoresponder \`#${entries.indexOf(entry) + 1}\` (\`${shortenId(entry.id)}\`).`);
    }

    if (action === 'exclusive') {
      const sub = String(args.shift() || 'list').toLowerCase();

      if (sub === 'list' || sub === 'view') {
        const entryRef = String(args.shift() || '').trim();
        const entries = await listAutoresponders(message.guild.id).catch(() => []);
        const entry = entryRef ? resolveEntryReference(entries, entryRef) : null;
        if (entryRef && !entry) {
          return respond.reply(message, 'bad', 'That autoresponder reference could not be found.');
        }
        const exclusives = await listAutoresponderExclusives(message.guild.id, entry?.id || null).catch(() => []);
        const description = exclusives.length
          ? exclusives.map((exclusive) => {
            const owner = entries.find((item) => item.id === exclusive.autoresponder_id);
            const slot = owner ? `#${entries.indexOf(owner) + 1}` : shortenId(exclusive.autoresponder_id);
            return `**${slot}** - ${exclusive.target_type}: \`${exclusive.target_id}\``;
          }).join('\n')
          : 'No autoresponder exclusives are configured.';
        return respond.reply(message, 'info', null, {
          allowTitle: true,
          title: 'Autoresponder exclusives',
          mentionUser: false,
          description
        });
      }

      const entryRef = String(args.shift() || '').trim();
      const entries = await listAutoresponders(message.guild.id).catch(() => []);
      const resolved = resolveEntryReference(entries, entryRef);
      const entry = resolved
        ? await getAutoresponder(message.guild.id, resolved.id).catch(() => null)
        : null;
      if (!entry) {
        return respond.reply(message, 'bad', 'That autoresponder reference could not be found.');
      }

      const target = await resolveTarget(message.guild, args.join(' '));
      if (!target) {
        return respond.reply(message, 'info', 'Use `autoresponder exclusive <set|remove> <id> <role|channel|user>`.', {
          mentionUser: false
        });
      }

      if (sub === 'set' || sub === 'add') {
        await addAutoresponderExclusive(message.guild.id, entry.id, target.type, target.id);
        return respond.reply(message, 'good', `Added an exclusive ${target.type} target for \`#${entries.indexOf(resolved) + 1}\`: ${target.label}`);
      }

      if (sub === 'remove' || sub === 'delete') {
        await removeAutoresponderExclusive(message.guild.id, entry.id, target.type, target.id).catch(() => null);
        return respond.reply(message, 'good', `Removed the exclusive ${target.type} target for \`#${entries.indexOf(resolved) + 1}\`.`);
      }
    }

    return respond.reply(message, 'info', 'Use `autoresponder <set|list|remove|exclusive>`.', { mentionUser: false });
  }
};
