const crypto = require('node:crypto');
const { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
 } = require('discord.js');
const store = require('./store');
const { checkEligibility, calculateBonusEntries, conditionLabel } = require('./conditions');
const { colorInt, formatDuration, unix } = require('./flags');
const logger = require('../logging/logger');

const RUNNER_INTERVAL_MS = 30_000;
const DEFAULT_REACTION_EMOJI = '\uD83C\uDF89';
let runnerStarted = false;

function messageUrl(giveaway) {
  if (!giveaway.guild_id || !giveaway.channel_id || !giveaway.message_id) return null;
  return `https://discord.com/channels/${giveaway.guild_id}/${giveaway.channel_id}/${giveaway.message_id}`;
}

function styleFromText(value) {
  const clean = String(value || '').toLowerCase();
  if (clean === 'secondary' || clean === 'gray' || clean === 'grey') return ButtonStyle.Secondary;
  if (clean === 'success' || clean === 'green') return ButtonStyle.Success;
  if (clean === 'danger' || clean === 'red') return ButtonStyle.Danger;
  return ButtonStyle.Primary;
}

async function renderGiveawayEmbed(giveaway, client, { ended = false } = {}) {
  const entries = await store.countEntries(giveaway.id).catch(() => 0);
  const conditions = await store.listConditions(giveaway.id).catch(() => []);
  const winners = ended ? await store.listWinners(giveaway.id).catch(() => []) : [];
  const endsAt = unix(giveaway.ends_at);
  const mode = giveaway.entry_mode === 'REACTION'
    ? `Reaction ${giveaway.reaction_emoji || DEFAULT_REACTION_EMOJI}`
    : 'Button';
  const statusLine = giveaway.status === 'SCHEDULED'
    ? `starts: <t:${unix(giveaway.starts_at)}:R>`
    : ended
      ? (giveaway.end_message || 'The giveaway has ended.')
      : `ends: <t:${endsAt}:R>`;
  const description = [
    giveaway.description ? resolveGiveawayText(giveaway.description, giveaway, { entries, winners }) : null,
    `**Prize:** ${String(giveaway.prize).slice(0, 512)}`,
    '',
    `host: <@${giveaway.host_id}>`,
    statusLine,
    `winners: **${giveaway.winners_count}**`,
    `entries: **${entries}**`,
    `mode: **${mode}**`,
    conditions.length ? `\n**Conditions**\n${conditions.map((row) => `- ${conditionLabel(row, { client })}`).join('\n')}` : null
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(colorInt(giveaway.color))
    .setAuthor({ name: resolveGiveawayText(giveaway.title || 'Giveaway', giveaway, { entries, winners }) })
    .setDescription(description.slice(0, 4096));

  if (winners.length) {
    embed.addFields({
      name: 'Winners',
      value: winners.map((winner) => `<@${winner.user_id}>`).join(', ').slice(0, 1024) || 'No eligible winners.',
      inline: false
    });
  }

  if (giveaway.thumbnail_url) embed.setThumbnail(giveaway.thumbnail_url);
  if (giveaway.image_url) embed.setImage(giveaway.image_url);
  embed.setFooter({ text: giveaway.footer || `Giveaway ${giveaway.public_id}` });

  return embed;
}
function resolveGiveawayText(input, giveaway, extra = {}) {
  const winnerMentions = (extra.winners || []).map((winner) => `<@${winner.user_id || winner.id}>`).join(', ');
  const replacements = {
    '{giveaway.id}': giveaway.public_id,
    '{giveaway.prize}': giveaway.prize,
    '{giveaway.winners_count}': String(giveaway.winners_count),
    '{giveaway.host}': `<@${giveaway.host_id}>`,
    '{giveaway.host_mention}': `<@${giveaway.host_id}>`,
    '{giveaway.entries_count}': String(extra.entries ?? 0),
    '{giveaway.duration}': formatDuration(new Date(giveaway.ends_at).getTime() - new Date(giveaway.starts_at).getTime()),
    '{giveaway.ends_relative}': `<t:${unix(giveaway.ends_at)}:R>`,
    '{giveaway.winners}': winnerMentions || 'N/A',
    '{giveaway.winner_mentions}': winnerMentions || 'N/A',
    '{channel.mention}': giveaway.channel_id ? `<#${giveaway.channel_id}>` : 'N/A'
  };

  let output = String(input || '');
  for (const [token, value] of Object.entries(replacements)) output = output.split(token).join(value);
  return output;
}

function buttonRow(giveaway, disabled = false) {
  if (giveaway.entry_mode !== 'BUTTON') return [];
  const button = new ButtonBuilder()
    .setCustomId(`giveaway:enter:${giveaway.public_id}`)
    .setLabel(String(giveaway.button_label || 'Enter Giveaway').slice(0, 80))
    .setStyle(styleFromText(giveaway.button_style))
    .setDisabled(disabled);
  if (giveaway.button_emoji) button.setEmoji(giveaway.button_emoji);
  return [new ActionRowBuilder().addComponents(button)];
}

async function fetchGiveawayChannel(client, giveaway) {
  const guild = client.guilds.cache.get(giveaway.guild_id) || await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return null;
  return guild.channels.cache.get(giveaway.channel_id) || await guild.channels.fetch(giveaway.channel_id).catch(() => null);
}

async function publishGiveaway(client, giveaway) {
  const channel = await fetchGiveawayChannel(client, giveaway);
  if (!channel?.isTextBased?.()) throw new Error('Giveaway channel is unavailable.');

  const embed = await renderGiveawayEmbed(giveaway, client);
  const sent = await channel.send({
    embeds: [embed],
    components: buttonRow(giveaway),
    allowedMentions: { parse: [] }
  });

  const updated = await store.updateGiveaway(giveaway.id, {
    message_id: sent.id,
    channel_id: channel.id,
    status: 'ACTIVE',
    starts_at: new Date().toISOString()
  });

  if (updated.entry_mode === 'REACTION') {
    await sent.react(updated.reaction_emoji || DEFAULT_REACTION_EMOJI).catch(() => null);
  }

  await store.logEvent(updated.guild_id, updated.id, 'started', updated.created_by, { messageId: sent.id });
  return updated;
}

async function refreshGiveawayMessage(client, giveaway, options = {}) {
  if (!giveaway.message_id) return null;
  const channel = await fetchGiveawayChannel(client, giveaway);
  const message = await channel?.messages?.fetch?.(giveaway.message_id).catch(() => null);
  if (!message) return null;
  const embed = await renderGiveawayEmbed(giveaway, client, options);
  return message.edit({
    embeds: [embed],
    components: buttonRow(giveaway, giveaway.status !== 'ACTIVE')
  }).catch(() => null);
}

async function enterGiveaway(client, giveaway, userId) {
  if (!giveaway || giveaway.status !== 'ACTIVE') return { ok: false, reason: 'This giveaway is not active.' };
  const guild = client.guilds.cache.get(giveaway.guild_id) || await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return { ok: false, reason: 'This server is unavailable.' };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || member.user.bot) return { ok: false, reason: 'Only server members can enter.' };

  const eligible = await checkEligibility(giveaway, member, 'entry', client);
  if (!eligible.ok) return eligible;

  const bonus = await calculateBonusEntries(giveaway, member).catch(() => 0);
  await store.addEntry(giveaway, userId, { entries: 1 + bonus, bonus_entries: bonus });
  await store.logEvent(giveaway.guild_id, giveaway.id, 'entry_added', userId, { bonus });
  refreshGiveawayMessage(client, giveaway).catch(() => null);
  return { ok: true, bonus };
}

function weightedPick(entries, count) {
  const pool = entries.map((entry) => ({
    ...entry,
    weight: Math.max(1, Number(entry.entries || 1))
  }));
  const winners = [];
  const audit = [];

  while (pool.length && winners.length < count) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = crypto.randomInt(Math.max(1, total));
    let pickedIndex = 0;
    for (; pickedIndex < pool.length; pickedIndex += 1) {
      cursor -= pool[pickedIndex].weight;
      if (cursor < 0) break;
    }
    const [picked] = pool.splice(Math.min(pickedIndex, pool.length - 1), 1);
    winners.push(picked);
    audit.push({ userId: picked.user_id, entries: picked.entries, pickedAt: new Date().toISOString() });
  }

  return { winners, audit };
}

async function selectEligibleWinners(client, giveaway, requestedCount) {
  const entries = await store.listEntries(giveaway.id, { validOnly: true });
  const guild = client.guilds.cache.get(giveaway.guild_id) || await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return { winners: [], audit: [], rejected: [{ reason: 'Guild unavailable' }] };

  const picked = weightedPick(entries, Math.max(requestedCount * 3, requestedCount));
  const winners = [];
  const rejected = [];

  for (const entry of picked.winners) {
    if (winners.length >= requestedCount) break;
    const member = await guild.members.fetch(entry.user_id).catch(() => null);
    if (!member) {
      rejected.push({ userId: entry.user_id, reason: 'Member left the server' });
      continue;
    }
    const eligible = await checkEligibility(giveaway, member, 'winner', client);
    if (!eligible.ok) {
      rejected.push({ userId: entry.user_id, reason: eligible.reason });
      continue;
    }
    winners.push(entry);
  }

  return { winners, audit: picked.audit, rejected };
}

async function endGiveaway(client, giveaway, actorId = null, { reroll = false, winnerCount = null } = {}) {
  const count = Math.max(1, Math.min(25, Number(winnerCount || giveaway.winners_count || 1)));
  const result = await selectEligibleWinners(client, giveaway, count);
  const type = reroll ? 'reroll' : 'end';
  const winners = [];

  for (const winner of result.winners) {
    winners.push(await store.addWinner(giveaway, winner, type, actorId, {
      audit: result.audit,
      rejected: result.rejected
    }));
  }

  const updated = await store.updateGiveaway(giveaway.id, {
    status: 'ENDED',
    reroll_count: Number(giveaway.reroll_count || 0) + (reroll ? 1 : 0),
    analytics_json: {
      ...(giveaway.analytics_json || {}),
      lastSelectionAudit: result.audit,
      lastRejected: result.rejected
    }
  });

  await refreshGiveawayMessage(client, updated, { ended: true }).catch(() => null);
  await store.logEvent(updated.guild_id, updated.id, type === 'reroll' ? 'rerolled' : 'ended', actorId, {
    winners: winners.map((winner) => winner.user_id),
    rejected: result.rejected
  });

  const channel = await fetchGiveawayChannel(client, updated);
  const winnerMentions = winners.map((winner) => `<@${winner.user_id}>`).join(', ') || 'No eligible winners.';
  const text = resolveGiveawayText(updated.winner_message || 'Congratulations {giveaway.winner_mentions}! You won **{giveaway.prize}**.', updated, {
    winners,
    entries: await store.countEntries(updated.id).catch(() => 0)
  });
  await channel?.send?.({ content: text || `Winners: ${winnerMentions}`, allowedMentions: { users: winners.map((winner) => winner.user_id) } }).catch(() => null);

  if (updated.dm_winner) {
    for (const winner of winners) {
      const user = await client.users.fetch(winner.user_id).catch(() => null);
      await user?.send?.(`You won **${updated.prize}** in **${channel?.guild?.name || 'a server'}**. ${messageUrl(updated) || ''}`).catch(() => null);
    }
  }

  return { giveaway: updated, winners, rejected: result.rejected };
}

async function cancelGiveaway(client, giveaway, actorId = null, { deleteMessage = false } = {}) {
  const updated = await store.updateGiveaway(giveaway.id, { status: 'CANCELLED' });
  if (deleteMessage && updated.message_id) {
    const channel = await fetchGiveawayChannel(client, updated);
    const message = await channel?.messages?.fetch?.(updated.message_id).catch(() => null);
    await message?.delete?.().catch(() => null);
  } else {
    await refreshGiveawayMessage(client, updated, { ended: true }).catch(() => null);
  }
  await store.logEvent(updated.guild_id, updated.id, 'cancelled', actorId, { deleteMessage });
  return updated;
}

async function handleGiveawayButton(interaction) {
  const [, action, publicId] = String(interaction.customId || '').split(':');
  if (action !== 'enter' || !publicId || !interaction.guildId) return false;
  const giveaway = await store.getGiveaway(interaction.guildId, publicId).catch(() => null);
  const result = await enterGiveaway(interaction.client, giveaway, interaction.user.id).catch((error) => ({
    ok: false,
    reason: error?.message || 'Could not enter the giveaway.'
  }));
  await interaction.reply({
    content: result.ok
      ? `You are entered${result.bonus ? ` with +${result.bonus} bonus entr${result.bonus === 1 ? 'y' : 'ies'}` : ''}.`
      : result.reason,
    flags: MessageFlags.Ephemeral
  }).catch(() => null);
  return true;
}

async function handleGiveawayReaction(client, reaction, user) {
  if (user?.bot || !reaction?.message?.guild) return false;
  const giveaway = await store.getGiveawayByMessage(reaction.message.guild.id, reaction.message.id).catch(() => null);
  if (!giveaway || giveaway.status !== 'ACTIVE' || giveaway.entry_mode !== 'REACTION') return false;
  const expected = giveaway.reaction_emoji || DEFAULT_REACTION_EMOJI;
  const got = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  if (got !== expected && reaction.emoji.name !== expected) return false;
  const result = await enterGiveaway(client, giveaway, user.id).catch((error) => ({ ok: false, reason: error.message }));
  if (!result.ok) await reaction.users.remove(user.id).catch(() => null);
  return true;
}

async function handleMemberLeave(member) {
  const config = await store.getConfig(member.guild.id).catch(() => null);
  if (!config?.remove_entry_on_leave) return;
  const active = await store.listGiveaways(member.guild.id, 'ACTIVE', 100).catch(() => []);
  for (const giveaway of active) {
    await store.removeEntry(giveaway.id, member.id).catch(() => null);
  }
}

async function recoverDueGiveaways(client) {
  const [scheduled, active, recurring] = await Promise.all([
    store.listDueScheduledGiveaways().catch(() => []),
    store.listDueActiveGiveaways().catch(() => []),
    store.listDueRecurringRules().catch(() => [])
  ]);
  for (const rule of recurring) {
    try {
      const payload = {
        ...(rule.payload_json || {}),
        guild_id: rule.guild_id,
        status: 'ACTIVE',
        starts_at: new Date().toISOString()
      };
      const endsAt = new Date(Date.now() + Number(rule.payload_json?.durationMs || 86_400_000));
      payload.ends_at = endsAt.toISOString();
      delete payload.durationMs;
      const giveaway = await store.createGiveaway(payload);
      await publishGiveaway(client, giveaway);
      await store.bumpRecurringRule(rule);
      await store.logEvent(rule.guild_id, giveaway.id, 'recurring_started', rule.created_by, { rule: rule.name });
    } catch (error) {
      logger.warn({ error, ruleId: rule.id }, 'Recurring giveaway start failed');
      await store.bumpRecurringRule(rule).catch(() => null);
    }
  }
  for (const giveaway of scheduled) await publishGiveaway(client, giveaway).catch((error) => logger.warn({ error, giveawayId: giveaway.id }, 'Scheduled giveaway recovery failed'));
  for (const giveaway of active) await endGiveaway(client, giveaway, null).catch((error) => logger.warn({ error, giveawayId: giveaway.id }, 'Giveaway auto-end failed'));
}

function startGiveawayRunner(client) {
  if (runnerStarted) return;
  runnerStarted = true;
  recoverDueGiveaways(client).catch(() => null);
  setInterval(() => recoverDueGiveaways(client).catch(() => null), RUNNER_INTERVAL_MS).unref?.();
}

function canManageGiveaways(member, config, giveaway = null, action = 'manage') {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config?.manager_role_id && member.roles.cache.has(config.manager_role_id)) return true;
  if (giveaway?.host_id === member.id && ['end', 'cancel'].includes(action)) return true;
  return false;
}

function isTextChannel(channel) {
  return channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement || channel?.isTextBased?.();
}

module.exports = {
  renderGiveawayEmbed,
  resolveGiveawayText,
  publishGiveaway,
  refreshGiveawayMessage,
  enterGiveaway,
  endGiveaway,
  cancelGiveaway,
  handleGiveawayButton,
  handleGiveawayReaction,
  handleMemberLeave,
  startGiveawayRunner,
  canManageGiveaways,
  isTextChannel,
  messageUrl
};
