const { PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { sendLog } = require('../../systems/logging/logDispatcher');

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

function makeTranscript(messages) {
  const lines = ['Rumi purge transcript', `Generated: ${new Date().toISOString()}`, `Messages: ${messages.length}`, '='.repeat(80)];
  for (const msg of [...messages].reverse()) {
    lines.push(`[${new Date(msg.createdTimestamp).toISOString()}] ${msg.author?.tag || 'Unknown'} (${msg.author?.id || 'unknown'})`);
    lines.push(`Message ID: ${msg.id}`);
    lines.push(`Content: ${msg.content || '[no text content]'}`);
    for (const a of msg.attachments?.values?.() || []) lines.push(`Attachment: ${a.name || 'file'} | ${a.contentType || 'unknown'} | ${a.url}`);
    lines.push('-'.repeat(80));
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

async function downloadAttachment(a, index) {
  if (!a?.url) return null;
  if (a.size && a.size > Number(process.env.PURGE_ATTACHMENT_MAX_BYTES || 8000000)) return null;
  try {
    const res = await fetch(a.url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const name = `${index + 1}-${a.name || 'attachment.bin'}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return new AttachmentBuilder(Buffer.from(ab), { name });
  } catch {
    return null;
  }
}

async function buildFiles(messages) {
  const files = [new AttachmentBuilder(makeTranscript(messages), { name: 'purge-transcript.txt' })];
  const atts = messages.flatMap((m) => [...(m.attachments?.values?.() || [])]).slice(0, Number(process.env.PURGE_ATTACHMENT_REUPLOAD_LIMIT || 10));
  for (let i = 0; i < atts.length; i += 1) {
    const f = await downloadAttachment(atts[i], i);
    if (f) files.push(f);
  }
  return files;
}

module.exports = {
  name: 'purge',
  aliases: ['clear', 'prune', 'clean', 'p'],
  category: 'moderation',
  description: 'Bulk delete recent messages and send a transcript to logs.',
  usage: 'purge <amount>',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],

  async execute({ message, args }) {
    const amount = Math.max(1, Math.min(Number(args.at(-1)) || 50, Number(process.env.PURGE_MAX_MESSAGES || 1000)));
    const fetched = await message.channel.messages.fetch({ limit: Math.min(amount + 1, 100) });
    const selected = [...fetched.values()].filter((m) => m.id !== message.id && Date.now() - m.createdTimestamp < FOURTEEN_DAYS).slice(0, amount);
    if (!selected.length) return respond.reply(message, 'info', 'I found no matching messages from the last 14 days.');
    const files = await buildFiles(selected);
    const result = await message.channel.bulkDelete(selected, true).catch(() => null);
    const deleted = result?.size || 0;
    await sendLog(message.guild, 'messageBulkDelete', {
      title: 'Messages purged',
      description: `**${deleted}** message(s) were purged in <#${message.channel.id}>. Transcript and recovered attachments are attached below.`,
      actorId: message.author.id,
      channelId: message.channel.id,
      fields: [
        { name: 'Requested amount', value: String(amount), inline: true },
        { name: 'Deleted', value: String(deleted), inline: true }
      ],
      files
    });
    return respond.reply(message, 'good', `Deleted **${deleted}** message(s). I also sent a transcript to the logs channel.`);
  }
};
