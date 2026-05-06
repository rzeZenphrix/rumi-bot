const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { findRole } = require('../../utils/roleResolver');
const { findMember } = require('../../utils/memberResolver');
const store = require('../../systems/giveaways/store');
const {
  canManageGiveaways,
  cancelGiveaway,
  endGiveaway,
  isTextChannel,
  messageUrl,
  publishGiveaway
} = require('../../systems/giveaways/manager');
const { conditionLabel } = require('../../systems/giveaways/conditions');
const {
  parseBool,
  parseDurationMs,
  parseFlags,
  normalizeColor,
  unix
} = require('../../systems/giveaways/flags');

function cleanId(value) {
  return extractId(value) || String(value || '').replace(/[<#@!&>]/g, '');
}

async function resolveChannel(guild, input, fallback = null) {
  if (!input) return fallback;
  const id = cleanId(input);
  if (id) {
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (channel) return channel;
  }
  const query = String(input || '').toLowerCase();
  return guild.channels.cache.find((channel) => String(channel.name || '').toLowerCase() === query) || fallback;
}

async function resolveUserId(guild, input, fallbackId) {
  if (!input || input === true) return fallbackId;
  if (String(input).toLowerCase() === 'me') return fallbackId;
  const member = await findMember(guild, input).catch(() => null);
  return member?.id || cleanId(input) || fallbackId;
}

async function buildGiveawayPayload(message, rawArgs, base = {}) {
  const { flags } = parseFlags(rawArgs);
  const config = await store.getConfig(message.guild.id);
  let preset = null;

  if (flags.preset) {
    preset = await store.getPreset(message.guild.id, flags.preset);
    if (!preset) throw new Error(`I could not find the giveaway preset \`${flags.preset}\`.`);
  }

  const presetConfig = preset?.config_json || {};
  const merged = {
    ...presetConfig,
    ...base,
    ...flags
  };

  const prize = String(merged.prize || '').trim();
  if (!prize) throw new Error('Use `giveaway start --prize "Prize" --duration 24h --winners 1`.');

  const durationMs = parseDurationMs(merged.duration || merged.for);
  if (!durationMs) throw new Error('Giveaway duration must be at least 10 seconds, like `30m`, `24h`, or `7d`.');

  const startsAt = merged.startsAt ? new Date(merged.startsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const hasButton = Boolean(merged.button);
  const hasReaction = Boolean(merged.reaction);
  if (hasButton && hasReaction) throw new Error('Choose either `--button` or `--reaction`, not both.');

  const entryMode = hasReaction ? 'REACTION' : hasButton ? 'BUTTON' : String(merged.entryMode || config.default_entry_mode || 'BUTTON').toUpperCase();
  const channel = await resolveChannel(message.guild, merged.channel, message.channel);
  if (!channel || !isTextChannel(channel)) throw new Error('I could not resolve a text channel for this giveaway.');

  const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions?.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error('I need Send Messages and Embed Links in the giveaway channel.');
  }
  if (entryMode === 'REACTION' && (!permissions.has(PermissionFlagsBits.AddReactions) || !permissions.has(PermissionFlagsBits.ReadMessageHistory))) {
    throw new Error('Reaction giveaways require Add Reactions and Read Message History.');
  }

  return {
    guild_id: message.guild.id,
    channel_id: channel.id,
    host_id: await resolveUserId(message.guild, merged.host, message.author.id),
    created_by: message.author.id,
    prize: prize.slice(0, 240),
    winners_count: Math.max(1, Math.min(25, Number(merged.winners || merged['winner-count'] || 1))),
    entry_mode: entryMode,
    reaction_emoji: entryMode === 'REACTION' ? String(merged.reaction === true ? '🎉' : merged.reaction || '🎉') : null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: startsAt.getTime() > Date.now() ? 'SCHEDULED' : 'ACTIVE',
    title: merged.title ? String(merged.title).slice(0, 256) : null,
    description: merged.description ? String(merged.description).slice(0, 1800) : null,
    footer: merged.footer ? String(merged.footer).slice(0, 512) : null,
    image_url: /^https?:\/\//i.test(String(merged.image || '')) ? String(merged.image) : null,
    thumbnail_url: /^https?:\/\//i.test(String(merged.thumbnail || '')) ? String(merged.thumbnail) : null,
    color: normalizeColor(merged.color || config.default_color),
    button_label: merged['button-label'] ? String(merged['button-label']).slice(0, 80) : null,
    button_emoji: merged['button-emoji'] ? String(merged['button-emoji']).slice(0, 80) : null,
    button_style: merged['button-style'] ? String(merged['button-style']).slice(0, 24) : null,
    winner_message: merged['winner-message'] ? String(merged['winner-message']).slice(0, 1500) : null,
    end_message: merged['end-message'] ? String(merged['end-message']).slice(0, 1500) : null,
    dm_winner: parseBool(merged['dm-winner'], Boolean(config.dm_winners)),
    metadata: { preset: preset?.name || null }
  };
}

async function requireGiveaway(message, id) {
  const giveaway = await store.getGiveaway(message.guild.id, id);
  if (!giveaway) throw new Error('I could not find that giveaway.');
  return giveaway;
}

function shortGiveawayLine(giveaway) {
  const status = giveaway.status.toLowerCase();
  return `\`${giveaway.public_id}\` **${giveaway.prize}** - ${status} - ends <t:${unix(giveaway.ends_at)}:R>`;
}

async function handleStart(message, rawArgs) {
  const payload = await buildGiveawayPayload(message, rawArgs);
  const giveaway = await store.createGiveaway(payload);
  if (giveaway.status === 'SCHEDULED') {
    await store.logEvent(giveaway.guild_id, giveaway.id, 'scheduled', message.author.id, { startsAt: giveaway.starts_at });
    return respond.reply(message, 'good', `Scheduled giveaway \`${giveaway.public_id}\` for <t:${unix(giveaway.starts_at)}:F>.`);
  }
  const published = await publishGiveaway(message.client, giveaway);
  return respond.reply(message, 'good', `Started giveaway \`${published.public_id}\` in <#${published.channel_id}>.`);
}

async function handleEnd(message, args) {
  const giveaway = await requireGiveaway(message, args[0]);
  const config = await store.getConfig(message.guild.id);
  if (!canManageGiveaways(message.member, config, giveaway, 'end')) return respond.reply(message, 'bad', 'You cannot end this giveaway.');
  const result = await endGiveaway(message.client, giveaway, message.author.id);
  return respond.reply(message, 'good', `Ended giveaway \`${giveaway.public_id}\`. Winners: ${result.winners.map((w) => `<@${w.user_id}>`).join(', ') || 'none'}.`);
}

async function handleCancel(message, args) {
  const giveaway = await requireGiveaway(message, args[0]);
  const config = await store.getConfig(message.guild.id);
  if (!canManageGiveaways(message.member, config, giveaway, 'cancel')) return respond.reply(message, 'bad', 'You cannot cancel this giveaway.');
  const { flags } = parseFlags(args.slice(1));
  await cancelGiveaway(message.client, giveaway, message.author.id, { deleteMessage: Boolean(flags['delete-message']) });
  return respond.reply(message, 'good', `Cancelled giveaway \`${giveaway.public_id}\`.`);
}

async function handleReroll(message, args) {
  const giveaway = await requireGiveaway(message, args[0]);
  const config = await store.getConfig(message.guild.id);
  if (!canManageGiveaways(message.member, config, giveaway, 'reroll')) return respond.reply(message, 'bad', 'You cannot reroll giveaways.');
  const { flags } = parseFlags(args.slice(1));
  const result = await endGiveaway(message.client, { ...giveaway, status: 'ACTIVE' }, message.author.id, { reroll: true, winnerCount: flags.winners });
  return respond.reply(message, 'good', `Rerolled \`${giveaway.public_id}\`. Winners: ${result.winners.map((w) => `<@${w.user_id}>`).join(', ') || 'none'}.`);
}

async function handleList(message, args) {
  const raw = String(args[0] || '').toUpperCase();
  const status = ['ACTIVE', 'ENDED', 'CANCELLED', 'SCHEDULED'].includes(raw) ? raw : null;
  const rows = await store.listGiveaways(message.guild.id, status, 15);
  return respond.reply(message, rows.length ? 'list' : 'info', rows.length ? null : 'No giveaways found.', {
    mentionUser: false,
    title: status ? `${status.toLowerCase()} giveaways` : 'Giveaways',
    description: rows.map(shortGiveawayLine).join('\n') || undefined
  });
}

async function handleInfo(message, args) {
  const giveaway = await requireGiveaway(message, args[0]);
  const entries = await store.countEntries(giveaway.id);
  const conditions = await store.listConditions(giveaway.id);
  const bonus = await store.listBonusRules(giveaway.id);
  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: `Giveaway ${giveaway.public_id}`,
    fields: [
      { name: 'Prize', value: giveaway.prize, inline: true },
      { name: 'Status', value: giveaway.status, inline: true },
      { name: 'Entries', value: String(entries), inline: true },
      { name: 'Host', value: `<@${giveaway.host_id}>`, inline: true },
      { name: 'Winners', value: String(giveaway.winners_count), inline: true },
      { name: 'Message', value: messageUrl(giveaway) || 'Not published yet', inline: false },
      { name: 'Conditions', value: conditions.map(conditionLabel).join('\n').slice(0, 1024) || 'None', inline: false },
      { name: 'Bonus rules', value: bonus.map((rule) => `\`${rule.id}\` ${rule.type} +${rule.entries}`).join('\n').slice(0, 1024) || 'None', inline: false }
    ]
  });
}

async function handleEntries(message, args) {
  const giveaway = await requireGiveaway(message, args[0]);
  const entries = await store.listEntries(giveaway.id, { validOnly: true });
  const rows = entries.slice(0, 25).map((entry, index) => `**${index + 1}.** <@${entry.user_id}> - ${entry.entries} entr${entry.entries === 1 ? 'y' : 'ies'}`);
  return respond.reply(message, 'list', null, {
    mentionUser: false,
    title: `Entries for ${giveaway.public_id}`,
    description: rows.join('\n') || 'No entries yet.'
  });
}

async function handlePreset(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  if (action === 'list') {
    const rows = await store.listPresets(message.guild.id);
    return respond.reply(message, 'list', rows.map((row) => `\`${row.name}\``).join(', ') || 'No giveaway presets yet.', { mentionUser: false });
  }
  if (action === 'view') {
    const row = await store.getPreset(message.guild.id, args[0]);
    if (!row) return respond.reply(message, 'bad', 'I could not find that preset.');
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `Preset ${row.name}`,
      description: `\`\`\`json\n${JSON.stringify(row.config_json, null, 2).slice(0, 1800)}\n\`\`\``
    });
  }
  if (action === 'delete') {
    await store.deletePreset(message.guild.id, args[0]);
    return respond.reply(message, 'good', `Deleted preset \`${args[0]}\`.`);
  }
  if (action === 'create' || action === 'edit') {
    const name = String(args.shift() || '').toLowerCase();
    if (!name) return respond.reply(message, 'info', 'Use `giveaway preset create <name> --prize "Nitro" --duration 24h --winners 1`.');
    const payload = await buildGiveawayPayload(message, args);
    await store.createPreset(message.guild.id, name, payload, message.author.id);
    return respond.reply(message, 'good', `Saved giveaway preset \`${name}\`.`);
  }
  return respond.reply(message, 'info', 'Use `giveaway preset <create|edit|list|view|delete>`.');
}

async function handleCondition(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  const giveaway = await requireGiveaway(message, args.shift());
  if (action === 'list') {
    const rows = await store.listConditions(giveaway.id);
    return respond.reply(message, 'list', rows.map((row) => `\`${row.id}\` ${conditionLabel(row)}`).join('\n') || 'No conditions configured.', { mentionUser: false });
  }
  if (action === 'clear') {
    await store.clearConditions(giveaway.id);
    return respond.reply(message, 'good', 'Cleared giveaway conditions.');
  }
  if (action === 'remove') {
    await store.removeCondition(giveaway.id, args[0]);
    return respond.reply(message, 'good', 'Removed that condition.');
  }
  if (action === 'add') {
    const { flags } = parseFlags(args);
    const type = String(flags.type || '').toLowerCase();
    const scope = String(flags.scope || 'entry').toLowerCase();
    if (!type || !['entry', 'winner', 'both'].includes(scope)) {
      return respond.reply(message, 'info', 'Use `giveaway condition add <id> --type messages --scope entry --min 100`.');
    }
    const role = flags.role ? await findRole(message.guild, flags.role).catch(() => null) : null;
    const inviterId = flags.inviter ? await resolveUserId(message.guild, flags.inviter, message.author.id) : null;
    const row = await store.addCondition(giveaway, {
      type,
      scope,
      min: flags.min || null,
      roleId: role?.id || cleanId(flags.role),
      serverId: cleanId(flags.server),
      inviterId
    }, message.author.id);
    return respond.reply(message, 'good', `Added condition \`${row.id}\`.`);
  }
  return respond.reply(message, 'info', 'Use `giveaway condition <add|list|remove|clear>`.');
}

async function handleBonus(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  const giveaway = await requireGiveaway(message, args.shift());
  if (action === 'list') {
    const rows = await store.listBonusRules(giveaway.id);
    return respond.reply(message, 'list', rows.map((row) => `\`${row.id}\` ${row.type} +${row.entries}`).join('\n') || 'No bonus rules configured.', { mentionUser: false });
  }
  if (action === 'remove') {
    await store.removeBonusRule(giveaway.id, args[0]);
    return respond.reply(message, 'good', 'Removed that bonus rule.');
  }
  if (action === 'add') {
    const { flags } = parseFlags(args);
    const entries = Math.max(1, Math.min(100, Number(flags.entries || 1)));
    let type = 'role';
    const config = { entries };
    if (flags.role) {
      const role = await findRole(message.guild, flags.role).catch(() => null);
      config.roleId = role?.id || cleanId(flags.role);
      type = 'role';
    } else if (flags.messages) {
      config.messages = Number(flags.messages);
      type = 'messages';
    } else if (flags['vc-time']) {
      config.vcTime = flags['vc-time'];
      type = 'vc_time';
    } else if (flags.booster) {
      type = 'booster';
    } else {
      return respond.reply(message, 'info', 'Use `giveaway bonus add <id> --role @VIP --entries 2`.');
    }
    const row = await store.addBonusRule(giveaway, { type, ...config }, message.author.id);
    return respond.reply(message, 'good', `Added bonus rule \`${row.id}\`.`);
  }
  return respond.reply(message, 'info', 'Use `giveaway bonus <add|list|remove>`.');
}

async function handleConfig(message, args) {
  const action = String(args.shift() || 'view').toLowerCase();
  const config = await store.getConfig(message.guild.id);
  if (action === 'view') {
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Giveaway config',
      fields: [
        { name: 'Default channel', value: config.default_channel_id ? `<#${config.default_channel_id}>` : 'Current channel', inline: true },
        { name: 'Manager role', value: config.manager_role_id ? `<@&${config.manager_role_id}>` : 'Manage Server', inline: true },
        { name: 'Default entry', value: config.default_entry_mode || 'BUTTON', inline: true },
        { name: 'Default color', value: config.default_color || '#ffb6c1', inline: true },
        { name: 'DM winners', value: config.dm_winners ? 'Yes' : 'No', inline: true },
        { name: 'Remove on leave', value: config.remove_entry_on_leave ? 'Yes' : 'No', inline: true },
        { name: 'Log channel', value: config.log_channel_id ? `<#${config.log_channel_id}>` : 'None', inline: true }
      ]
    });
  }
  const patch = {};
  if (action === 'channel') patch.default_channel_id = (await resolveChannel(message.guild, args[0], null))?.id || null;
  else if (action === 'manager-role') patch.manager_role_id = (await findRole(message.guild, args.join(' ')).catch(() => null))?.id || cleanId(args[0]);
  else if (action === 'default-entry') patch.default_entry_mode = String(args[0] || 'BUTTON').toUpperCase() === 'REACTION' ? 'REACTION' : 'BUTTON';
  else if (action === 'default-color') patch.default_color = normalizeColor(args[0]);
  else if (action === 'dm-winners') patch.dm_winners = parseBool(args[0], true);
  else if (action === 'remove-entry-on-leave') patch.remove_entry_on_leave = parseBool(args[0], true);
  else if (action === 'log-channel') patch.log_channel_id = (await resolveChannel(message.guild, args[0], null))?.id || null;
  else return respond.reply(message, 'info', 'Use `giveaway config <view|channel|manager-role|default-entry|default-color|dm-winners|remove-entry-on-leave|log-channel>`.');
  await store.updateConfig(message.guild.id, patch);
  return respond.reply(message, 'good', 'Saved giveaway config.');
}

async function handleStats(message, args) {
  if (args[0] === 'user') {
    const member = await findMember(message.guild, args.slice(1).join(' '), message.author.id);
    const active = await store.listGiveaways(message.guild.id, null, 100);
    let entries = 0;
    let wins = 0;
    for (const giveaway of active) {
      const rows = await store.listEntries(giveaway.id);
      entries += rows.filter((row) => row.user_id === member.id).length;
      const winnerRows = await store.listWinners(giveaway.id);
      wins += winnerRows.filter((row) => row.user_id === member.id).length;
    }
    return respond.reply(message, 'info', `${member} has joined **${entries}** giveaway(s) and won **${wins}** time(s).`, { mentionUser: false });
  }
  const rows = await store.listGiveaways(message.guild.id, null, 100);
  const totals = rows.reduce((map, row) => {
    map[row.status] = (map[row.status] || 0) + 1;
    map.total += 1;
    return map;
  }, { total: 0 });
  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: 'Giveaway stats',
    fields: [
      { name: 'Total', value: String(totals.total || 0), inline: true },
      { name: 'Active', value: String(totals.ACTIVE || 0), inline: true },
      { name: 'Scheduled', value: String(totals.SCHEDULED || 0), inline: true },
      { name: 'Ended', value: String(totals.ENDED || 0), inline: true },
      { name: 'Cancelled', value: String(totals.CANCELLED || 0), inline: true }
    ]
  });
}

async function handleSchedule(message, args) {
  const { flags } = parseFlags(args);
  const startsInMs = parseDurationMs(flags['starts-in']);
  if (!startsInMs) return respond.reply(message, 'info', 'Use `giveaway schedule --starts-in 2h --prize "Nitro" --duration 24h --winners 1`.');
  const startsAt = new Date(Date.now() + startsInMs).toISOString();
  const payload = await buildGiveawayPayload(message, args, { startsAt });
  const giveaway = await store.createGiveaway({ ...payload, status: 'SCHEDULED' });
  await store.logEvent(message.guild.id, giveaway.id, 'scheduled', message.author.id, { startsAt });
  return respond.reply(message, 'good', `Scheduled giveaway \`${giveaway.public_id}\` for <t:${unix(startsAt)}:F>.`);
}

async function handleRecurring(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  if (action === 'list') {
    const rows = await store.listRecurringRules(message.guild.id);
    return respond.reply(message, 'list', rows.map((row) => `\`${row.name}\` every ${row.every_seconds}s - next <t:${unix(row.next_run_at)}:R>`).join('\n') || 'No recurring giveaways configured.', { mentionUser: false });
  }
  if (action === 'delete') {
    await store.deleteRecurringRule(message.guild.id, args[0]);
    return respond.reply(message, 'good', `Deleted recurring giveaway \`${args[0]}\`.`);
  }
  if (action === 'create') {
    const name = String(args.shift() || '').toLowerCase();
    const { flags } = parseFlags(args);
    const everyMs = parseDurationMs(flags.every);
    if (!name || !everyMs) return respond.reply(message, 'info', 'Use `giveaway recurring create weekly-nitro --every 7d --preset nitro`.');
    const payload = await buildGiveawayPayload(message, args);
    payload.status = 'ACTIVE';
    payload.durationMs = new Date(payload.ends_at).getTime() - new Date(payload.starts_at).getTime();
    await store.createRecurringRule(message.guild.id, name, Math.floor(everyMs / 1000), payload, message.author.id);
    return respond.reply(message, 'good', `Saved recurring giveaway \`${name}\`.`);
  }
  return respond.reply(message, 'info', 'Use `giveaway recurring <create|list|delete>`.');
}

const subcommands = [
  ['start', 'giveaway start --prize "Discord Nitro" --duration 24h --winners 2 --button'],
  ['end', 'giveaway end <giveaway_id>'],
  ['cancel', 'giveaway cancel <giveaway_id> [--delete-message]'],
  ['reroll', 'giveaway reroll <giveaway_id> [--winners 2]'],
  ['list', 'giveaway list [active|ended|cancelled|scheduled]'],
  ['info', 'giveaway info <giveaway_id>'],
  ['entries', 'giveaway entries <giveaway_id>'],
  ['preset', 'giveaway preset <create|edit|list|view|delete>'],
  ['condition', 'giveaway condition <add|list|remove|clear>'],
  ['bonus', 'giveaway bonus <add|list|remove>'],
  ['config', 'giveaway config <view|channel|manager-role|default-entry|default-color|dm-winners|remove-entry-on-leave|log-channel>'],
  ['stats', 'giveaway stats [user @user]'],
  ['schedule', 'giveaway schedule --starts-in 2h --prize "Nitro" --duration 24h'],
  ['recurring', 'giveaway recurring <list>']
].map(([name, usage]) => ({ name, usage, description: `Manage giveaway ${name}.`, examples: [usage] }));

module.exports = {
  name: 'giveaway',
  aliases: ['giveaways', 'gway', 'gw'],
  category: 'community',
  description: 'Run database-backed button or reaction giveaways with presets, conditions, bonus entries, and recovery.',
  usage: 'giveaway <start|end|cancel|reroll|list|info|entries|preset|condition|bonus|config|stats|schedule|recurring>',
  examples: [
    'giveaway start --prize "Discord Nitro" --duration 24h --winners 2 --button',
    'giveaway start --prize "Nitro" --duration 24h --reaction 🎉',
    'giveaway preset create nitro --prize "Discord Nitro" --duration 24h --winners 1 --button',
    'giveaway condition add ab12cd34 --type messages --scope entry --min 100',
    'giveaway bonus add ab12cd34 --role @Booster --entries 2'
  ],
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 5,
  guildOnly: true,
  subcommands,

  async execute({ message, args }) {
    const sub = String(args.shift() || 'list').toLowerCase();
    const config = await store.getConfig(message.guild.id);
    if (!canManageGiveaways(message.member, config, null, sub) && !['list', 'info', 'entries', 'stats'].includes(sub)) {
      return respond.reply(message, 'bad', 'You need Manage Server or the configured giveaway manager role.');
    }

    try {
      if (sub === 'start') return await handleStart(message, args);
      if (sub === 'end') return await handleEnd(message, args);
      if (sub === 'cancel') return await handleCancel(message, args);
      if (sub === 'reroll') return await handleReroll(message, args);
      if (sub === 'list') return await handleList(message, args);
      if (sub === 'info') return await handleInfo(message, args);
      if (sub === 'entries') return await handleEntries(message, args);
      if (sub === 'preset') return await handlePreset(message, args);
      if (sub === 'condition') return await handleCondition(message, args);
      if (sub === 'bonus') return await handleBonus(message, args);
      if (sub === 'config') return await handleConfig(message, args);
      if (sub === 'stats') return await handleStats(message, args);
      if (sub === 'schedule') return await handleSchedule(message, args);
      if (sub === 'recurring') return await handleRecurring(message, args);
      return respond.reply(message, 'info', 'Use `giveaway <start|end|cancel|reroll|list|info|entries|preset|condition|bonus|config|stats|schedule>`.');
    } catch (error) {
      return respond.reply(message, 'bad', error?.message || 'Giveaway command failed.');
    }
  }
};
