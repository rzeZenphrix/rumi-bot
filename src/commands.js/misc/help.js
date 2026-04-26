const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const WEBSITE_URL =
  process.env.WEBSITE_URL ||
  process.env.DASHBOARD_URL ||
  'https://your-website.com';

function ownerIds() {
  return String(process.env.BOT_OWNER_IDS || process.env.OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isOwner(userId) {
  return ownerIds().includes(String(userId));
}

function getPrefix(message, providedPrefix) {
  return providedPrefix || message.client.prefix || process.env.DEFAULT_PREFIX || ',';
}

function uniqueCommands(client) {
  const seen = new Set();
  const output = [];

  for (const command of client.commands?.values?.() || []) {
    if (!command?.name) continue;
    if (seen.has(command.name)) continue;

    seen.add(command.name);
    output.push(command);
  }

  return output.sort((a, b) => a.name.localeCompare(b.name));
}

function visibleCommands(client, userId) {
  return uniqueCommands(client).filter((command) => {
    if (command.hidden && !isOwner(userId)) return false;
    if (command.ownerOnly && !isOwner(userId)) return false;
    return true;
  });
}

function findCommand(client, name) {
  const clean = String(name || '').toLowerCase();

  for (const command of uniqueCommands(client)) {
    if (command.name?.toLowerCase() === clean) return command;

    if (
      Array.isArray(command.aliases) &&
      command.aliases.map((x) => String(x).toLowerCase()).includes(clean)
    ) {
      return command;
    }
  }

  return null;
}

function commandSyntax(command, prefix) {
  if (command.usage) {
    return `${prefix}${command.name} ${command.usage}`.trim();
  }

  return `${prefix}${command.name}`;
}

function commandExample(command, prefix) {
  if (Array.isArray(command.examples) && command.examples[0]) {
    const example = command.examples[0];

    if (String(example).startsWith(prefix)) {
      return example;
    }

    return `${prefix}${example}`;
  }

  return commandSyntax(command, prefix);
}

function commandParameters(command) {
  if (command.parameters) return command.parameters;

  if (command.usage) {
    const params = String(command.usage).match(/<[^>]+>|\[[^\]]+\]/g);
    if (params?.length) return params.join(' ');
  }

  if (Array.isArray(command.subcommands) && command.subcommands.length) {
    return `${command.subcommands.length} subcommands`;
  }

  return 'n/a';
}

function commandInformation(command) {
  if (command.information) return command.information;
  if (command.permissions?.length) return 'permission gated';
  if (command.ownerOnly) return 'owner only';
  if (command.guildOnly) return 'server only';
  return 'n/a';
}

function makeSingleCommandEmbed(message, command, prefix) {
  const bot = message.client.user;
  const all = visibleCommands(message.client, message.author.id);
  const moduleName = command.category || command.module || 'general';
  const moduleEntries = all.filter(
    (cmd) => (cmd.category || cmd.module || 'general') === moduleName
  );

  const pageIndex = Math.max(
    1,
    moduleEntries.findIndex((cmd) => cmd.name === command.name) + 1
  );

  const embed = new EmbedBuilder()
    .setColor(0x2b1a1d)
    .setAuthor({
      name: bot.username,
      iconURL: bot.displayAvatarURL({ size: 128 })
    })
    .setDescription(
      [
        `**${command.name}**`,
        `> ${command.description || 'No description provided.'}`,
        '',
        '**Aliases**',
        `${command.aliases?.length ? command.aliases.join(', ') : 'n/a'}`,
        '',
        '**Parameters**',
        `${commandParameters(command)}`,
        '',
        '**Information**',
        `${commandInformation(command)}`,
        '',
        '**Usage**',
        '',
        '```ansi',
        `Syntax: ${commandSyntax(command, prefix)}`,
        `Example: ${commandExample(command, prefix)}`,
        '```',
        `**Page ${pageIndex}/${Math.max(moduleEntries.length, 1)} (${moduleEntries.length} entries) • Module: ${moduleName}**`
      ].join('\n')
    );

  return embed;
}

function makeGeneralHelpEmbed(message, prefix) {
  const commands = visibleCommands(message.client, message.author.id);

  const categories = new Map();

  for (const command of commands) {
    const category = command.category || command.module || 'general';

    if (!categories.has(category)) {
      categories.set(category, []);
    }

    categories.get(category).push(command.name);
  }

  const lines = [
    `Use \`${prefix}help <command>\` to view a command.`,
    `Documentation: ${WEBSITE_URL}`,
    ''
  ];

  for (const [category, names] of categories) {
    lines.push(`**${category}**`);
    lines.push(names.slice(0, 12).map((name) => `\`${name}\``).join(' '));

    if (names.length > 12) {
      lines.push(`and ${names.length - 12} more...`);
    }

    lines.push('');
  }

  return new EmbedBuilder()
    .setColor(0x2b1a1d)
    .setAuthor({
      name: message.client.user.username,
      iconURL: message.client.user.displayAvatarURL({ size: 128 })
    })
    .setDescription(lines.join('\n').slice(0, 4096));
}

function helpButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Website')
      .setStyle(ButtonStyle.Link)
      .setURL(WEBSITE_URL),
    new ButtonBuilder()
      .setLabel('Support')
      .setStyle(ButtonStyle.Link)
      .setURL(process.env.SUPPORT_URL || WEBSITE_URL)
  );
}

module.exports = {
  name: 'help',
  aliases: ['commands', 'cmds'],
  category: 'core',
  description: 'View the command list or detailed command usage.',
  usage: '[command]',
  examples: ['help', 'help ping', 'help antinuke'],

  async execute({ message, args, prefix }) {
    const usedPrefix = getPrefix(message, prefix);
    const query = args.join(' ').trim();

    if (query) {
      const command = findCommand(message.client, query);

      if (!command) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setDescription(`I couldn't find a command named \`${query}\`.`)
          ],
          allowedMentions: { parse: [] }
        });
      }

      if ((command.hidden || command.ownerOnly) && !isOwner(message.author.id)) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setDescription(`I couldn't find a command named \`${query}\`.`)
          ],
          allowedMentions: { parse: [] }
        });
      }

      return message.channel.send({
        embeds: [makeSingleCommandEmbed(message, command, usedPrefix)],
        allowedMentions: { parse: [] }
      });
    }

    return message.channel.send({
      embeds: [makeGeneralHelpEmbed(message, usedPrefix)],
      components: [helpButtons()],
      allowedMentions: { parse: [] }
    });
  }
};