const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { parseEmbedScript, validateEmbedScript } = require('../../systems/embedScript/parser');

function takeName(args) {
  const name = args.shift();
  return name ? name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : null;
}

module.exports = {
  name: 'createembed',
  aliases: ['customembed', 'ce'],
  category: 'utility',
  description: 'I send, preview, validate, save, and load Bleed/Greed-style embed scripts.',
  usage: 'createembed [save|load|list|delete|preview|validate] ...',
  examples: [
    'createembed {embed}$v{description: hello}$v{color: #000000}',
    'createembed preview {embed}$v{description: hello}',
    'createembed save boost {embed}$v{description: thanks {user.mention}}',
    'createembed load boost'
  ],
  subcommands: [
    { name: 'send', description: 'Send an embed script directly.', usage: '<script>' },
    { name: 'preview', description: 'Preview a script.', usage: 'preview <script>' },
    { name: 'validate', description: 'Validate a script without sending it.', usage: 'validate <script>' },
    { name: 'save', description: 'Save a reusable embed template.', usage: 'save <name> <script>' },
    { name: 'load', description: 'Send a saved template.', usage: 'load <name>' },
    { name: 'list', description: 'List saved templates.', usage: 'list' },
    { name: 'delete', description: 'Delete a template.', usage: 'delete <name>' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  typing: true,

  async execute({ message, args }) {
    const maybeSub = String(args[0] || '').toLowerCase();
    const subcommands = new Set(['preview', 'validate', 'save', 'load', 'list', 'delete', 'remove']);
    const sub = subcommands.has(maybeSub) ? args.shift().toLowerCase() : 'send';

    if (sub === 'list') {
      const rows = await db.listEmbedTemplates(message.guild.id);
      const lines = rows.map((row) => `\`${row.name}\` — updated <t:${Math.floor(new Date(row.updated_at).getTime() / 1000)}:R>`);
      return respond.reply(message, 'info', lines.length ? `I have these templates saved:\n${lines.join('\n')}` : 'I do not have any embed templates saved yet.');
    }

    if (sub === 'delete' || sub === 'remove') {
      const name = takeName(args);
      if (!name) return respond.reply(message, 'info', 'Use `createembed delete <name>`.');
      await db.deleteEmbedTemplate(message.guild.id, name);
      return respond.reply(message, 'good', `I deleted the \`${name}\` embed template.`);
    }

    if (sub === 'load') {
      const name = takeName(args);
      if (!name) return respond.reply(message, 'info', 'Use `createembed load <name>`.');
      const row = await db.getEmbedTemplate(message.guild.id, name);
      if (!row) return respond.reply(message, 'bad', `I could not find an embed template named \`${name}\`.`);
      const payload = parseEmbedScript(row.script, { message });
      return message.channel.send(payload);
    }

    if (sub === 'save') {
      const name = takeName(args);
      const script = args.join(' ').trim();
      if (!name || !script) return respond.reply(message, 'info', 'Use `createembed save <name> <script>`.');
      const validation = validateEmbedScript(script, { message });
      if (!validation.ok) return respond.reply(message, 'bad', `I could not save it: ${validation.errors.join(', ')}`);
      await db.saveEmbedTemplate(message.guild.id, name, script, message.author.id);
      return respond.reply(message, 'good', `I saved the \`${name}\` embed template.`);
    }

    const script = args.join(' ').trim();
    if (!script) return respond.reply(message, 'info', 'Send an embed script after `createembed`.');

    if (sub === 'validate') {
      const validation = validateEmbedScript(script, { message });
      if (!validation.ok) return respond.reply(message, 'bad', `I found validation issue(s): ${validation.errors.join(', ')}`);
      return respond.reply(message, 'good', `I validated that script. Content: **${validation.summary.hasContent ? 'yes' : 'no'}**, embeds: **${validation.summary.embeds}**, components: **${validation.summary.components}**.`);
    }

    const payload = parseEmbedScript(script, { message });

    if (sub === 'preview') {
      payload.content = payload.content ? `**Preview:**\n${payload.content}` : '**Preview:**';
    }

    return message.channel.send(payload);
  }
};
