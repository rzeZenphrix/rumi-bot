const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { validateEmbedScript } = require('../../systems/embedScript/parser');

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

module.exports = {
  name: 'customcommand',
  aliases: ['cc', 'customcmd'],
  category: 'config',
  description: 'I manage Supabase-backed custom commands powered by embed scripts.',
  usage: 'cc add|remove|list ...',
  examples: ['cc add rules {embed}$v{description: Read the rules}', 'cc remove rules', 'cc list'],
  subcommands: [
    { name: 'add', description: 'Create or update a custom command.', usage: 'add <name> <script>' },
    { name: 'remove', description: 'Remove a custom command.', usage: 'remove <name>' },
    { name: 'list', description: 'List custom commands.', usage: 'list' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'list') {
      const rows = await db.listCustomCommands(message.guild.id);
      const lines = rows.map((row) => `\`${row.name}\` — ${row.enabled ? 'enabled' : 'disabled'}`);
      return respond.reply(message, 'info', lines.length ? `I found these custom commands:\n${lines.join('\n')}` : 'I have no custom commands saved for this server.');
    }

    if (sub === 'remove' || sub === 'delete') {
      const name = normalizeName(args.shift());
      if (!name) return respond.reply(message, 'info', 'Use `cc remove <name>`.');
      await db.deleteCustomCommand(message.guild.id, name);
      return respond.reply(message, 'good', `I removed the custom command \`${name}\`.`);
    }

    if (sub === 'add' || sub === 'set') {
      const name = normalizeName(args.shift());
      const script = args.join(' ').trim();
      if (!name || !script) return respond.reply(message, 'info', 'Use `cc add <name> <embed script or message>`.');
      const validation = validateEmbedScript(script, { message });
      if (!validation.ok) return respond.reply(message, 'bad', `I could not save that custom command: ${validation.errors.join(', ')}`);
      await db.saveCustomCommand(message.guild.id, name, script, message.author.id);
      return respond.reply(message, 'good', `I saved custom command \`${name}\`.`);
    }

    return respond.reply(message, 'info', 'Use `cc add`, `cc remove`, or `cc list`.');
  }
};
