const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('./simpleStore');
const { sendLog } = require('../logging/logDispatcher');

const buckets = new Map();

function bucketKey(guildId, actorId, eventType) {
  return `${guildId}:${actorId}:${eventType}`;
}

function recordAction(guildId, actorId, eventType, windowMs) {
  const key = bucketKey(guildId, actorId, eventType);
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((time) => now - time <= windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length;
}

async function fetchActor(guild, auditType, targetId) {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 }).catch(() => null);
  const entry = logs?.entries?.find((e) => {
    if (!e.executor?.id) return false;
    if (!targetId) return true;
    return e.target?.id === targetId;
  });
  return entry?.executor || null;
}

async function stripDangerousRoles(member) {
  const dangerous = member.roles.cache.filter((role) => {
    if (role.managed || role.id === member.guild.id) return false;
    return role.permissions.has(PermissionFlagsBits.Administrator) ||
      role.permissions.has(PermissionFlagsBits.ManageGuild) ||
      role.permissions.has(PermissionFlagsBits.ManageRoles) ||
      role.permissions.has(PermissionFlagsBits.ManageChannels) ||
      role.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
      role.permissions.has(PermissionFlagsBits.BanMembers) ||
      role.permissions.has(PermissionFlagsBits.KickMembers) ||
      role.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      role.permissions.has(PermissionFlagsBits.ManageMessages);
  });

  let removed = 0;
  for (const role of dangerous.values()) {
    await member.roles.remove(role, 'Anti-nuke mitigation: dangerous permissions').then(() => { removed += 1; }).catch(() => null);
  }
  return removed;
}

async function punish(guild, actor, config, eventType, count) {
  if (!actor || actor.bot || actor.id === guild.ownerId || actor.id === guild.client.user.id) return;
  if (config.whitelist.includes(actor.id)) return;

  const member = await guild.members.fetch(actor.id).catch(() => null);
  if (!member) return;

  let result = 'No action taken.';
  if (config.punishment === 'ban') {
    await member.ban({ reason: `Anti-nuke: ${eventType} threshold hit (${count})` }).then(() => { result = 'Banned actor.'; }).catch(() => null);
  } else if (config.punishment === 'kick') {
    await member.kick(`Anti-nuke: ${eventType} threshold hit (${count})`).then(() => { result = 'Kicked actor.'; }).catch(() => null);
  } else if (config.punishment === 'timeout') {
    await member.timeout(12 * 60 * 60 * 1000, `Anti-nuke: ${eventType} threshold hit (${count})`).then(() => { result = 'Timed out actor for 12h.'; }).catch(() => null);
  } else {
    const removed = await stripDangerousRoles(member);
    result = `Stripped ${removed} dangerous role(s).`;
  }

  await sendLog(guild, 'antiNuke', {
    title: 'Anti-nuke triggered',
    description: `${actor} triggered **${eventType}** threshold (**${count}** action(s)). ${result}`,
    userId: actor.id
  });
}

async function handleNukeAction(guild, auditType, eventType, targetId) {
  const config = getConfig(guild.id);
  if (!config.enabled) return;

  const threshold = config.thresholds[eventType];
  if (!threshold) return;

  const actor = await fetchActor(guild, auditType, targetId);
  if (!actor || actor.bot || config.whitelist.includes(actor.id)) return;

  const count = recordAction(guild.id, actor.id, eventType, config.thresholds.windowMs || 30000);
  if (count >= threshold) await punish(guild, actor, config, eventType, count);
}

module.exports = { handleNukeAction, AuditLogEvent };
