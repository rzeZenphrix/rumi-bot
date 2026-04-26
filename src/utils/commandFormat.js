const { PermissionFlagsBits } = require('discord.js');

function mentionUser(id) { return id ? `<@${id}>` : 'Unknown'; }
function mentionChannel(id) { return id ? `<#${id}>` : 'Unknown'; }
function mentionRole(id) { return id ? `<@&${id}>` : 'Unknown'; }

function firstId(input) {
  return String(input || '').match(/(\d{17,20})/)?.[1] || null;
}

function code(value) { return `\`${String(value).replace(/`/g, 'ˋ')}\``; }

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function progressBar(current, total, size = 10) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
  const filled = Math.round(ratio * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function splitList(text) {
  return String(text || '').split(/\s*,\s*|\s+\|\s+/).map(x => x.trim()).filter(Boolean);
}

function requireManageGuild() { return [PermissionFlagsBits.ManageGuild]; }
function requireManageMessages() { return [PermissionFlagsBits.ManageMessages]; }
function requireModerate() { return [PermissionFlagsBits.ModerateMembers]; }
function requireBan() { return [PermissionFlagsBits.BanMembers]; }
function requireKick() { return [PermissionFlagsBits.KickMembers]; }
function requireChannels() { return [PermissionFlagsBits.ManageChannels]; }

module.exports = { mentionUser, mentionChannel, mentionRole, firstId, code, clamp, pick, progressBar, splitList, requireManageGuild, requireManageMessages, requireModerate, requireBan, requireKick, requireChannels };
