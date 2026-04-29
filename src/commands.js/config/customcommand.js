const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { validateEmbedScript } = require('../../systems/embedScript/parser');
const { normalizeName } = require('../../systems/customcommands/runner');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

module.exports = {
  name: 'customcommand',
  aliases: ['cc', 'customcmd'],
  category: 'config',
  description: 'Manage custom commands powered by embed scripts.',
  usage: 'cc <add|remove|list> ...',
  examples: ['cc add rules {embed}$v{description: Read the #rules}', 'cc remove rules', 'cc list'],
  subcommands: [
    {
      name: 'add',
      description: 'Create or update a custom command.',
      usage: 'add name script'
    },
    {
      name: 'remove',
      description: 'Remove a custom command.',
      usage: 'remove name'
    },
    {
      name: 'list',
      description: 'List custom commands.',
      usage: 'list'
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'list') {
      const rows = await db.listCustomCommands(message.guild.id).catch(() => null);
      if (!rows) {
        return respond.reply(
          message,
          'bad',
          'I could not load custom commands because the database is currently unreachable.'
        );
      }

      const lines = rows.map((row) => `\`${row.name}\` - ${row.enabled ? 'enabled' : 'disabled'}`);
      return respond.reply(
        message,
        'info',
        lines.length
          ? `I found these custom commands:\n${lines.join('\n')}`
          : 'I have no custom commands saved for this server.'
      );
    }

    if (sub === 'remove' || sub === 'delete') {
      const name = normalizeName(args.shift());
      if (!name) return respond.reply(message, 'info', 'Use `cc remove name`.');

      const removed = await db.deleteCustomCommand(message.guild.id, name).catch(() => null);
      if (!removed) {
        return respond.reply(
          message,
          'bad',
          'I could not remove that custom command because the database is currently unreachable.'
        );
      }

      return respond.reply(message, 'good', `I removed the custom command **\`${name}\`**.`);
    }

    if (sub === 'add' || sub === 'set') {
      const name = normalizeName(args.shift());
      const script = args.join(' ').trim();
      if (!name || !script) return respond.reply(message, 'info', 'Use `cc add name [embed script or message]`.');

      if (message.client?.commands?.has(name)) {
        return respond.reply(
          message,
          'bad',
          `I cannot save **\`${name}\`** because it conflicts with a built-in command or alias.`
        );
      }

      const validation = validateEmbedScript(script, { message });
      if (!validation.ok) {
        return respond.reply(
          message,
          'bad',
          `I could not save that custom command: ${validation.errors.join(', ')}`
        );
      }

      const access = await getPremiumAccessForMessage(message).catch(() => null);
      const limit = access?.limits?.customCommands || 7;
      const existing = await db.listCustomCommands(message.guild.id).catch(() => null);
      if (existing && !existing.some((row) => row.name === name) && existing.length >= limit) {
        return respond.reply(
          message,
          'bad',
          access?.hasServerPremiumBase
            ? 'This server already used all 20 custom command slots.'
            : 'Free servers can save up to 7 custom commands. Server premium raises that to 20.'
        );
      }

      const saved = await db.saveCustomCommand(message.guild.id, name, script, message.author.id).catch(() => null);
      if (!saved) {
        return respond.reply(
          message,
          'bad',
          'I could not save that custom command because the database is currently unreachable.'
        );
      }

      return respond.reply(message, 'good', `I saved custom command **\`${name}\`**.`);
    }

    return respond.reply(message, 'info', 'Use `cc add`, `cc remove`, or `cc list`.');
  }
};
