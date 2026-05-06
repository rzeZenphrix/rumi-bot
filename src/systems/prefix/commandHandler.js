const logger = require('../logging/logger');
const { matchPrefix } = require('./prefixManager');
const respond = require('../../utils/respond');
const { isBotOwner } = require('../owner/ownerManager');
const db = require('../../services/database');
const { checkCooldown, setCooldown, formatRemaining } = require('../cooldowns/cooldownManager.js');
const { PermissionFlagsBits } = require('discord.js');
const { runCustomCommand } = require('../customcommands/runner');
const { isDirectMusicCommand } = require('../music/musicAliases');
const { getDisabledCommands, isProtectedCommand, isCommandDisabled } = require('../commands/disabledCommands');
const { getCommandNotFoundSettings } = require('./commandNotFoundSetting');

function permissionLabel(permission) {
  const match = Object.entries(PermissionFlagsBits).find(([, value]) => value === permission);
  return match?.[0]?.replace(/([a-z])([A-Z])/g, '$1 $2') || permission.toString();
}

async function safeReply(message, type, action, options = {}) {
  try {
    return await respond.reply(message, type, action, options);
  } catch (error) {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || 0);

    if (code === 50013 || status === 403) {
      logger.warn(
        {
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          userId: message.author?.id,
          replyType: type,
          replyAction: action
        },
        'Could not send prefix reply because Discord denied channel permissions'
      );

      return null;
    }

    throw error;
  }
}

function parseArgs(input) {
  const args = [];
  const regex = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g;

  let match;

  while ((match = regex.exec(input)) !== null) {
    args.push(match[1] || match[2] || match[3] || match[4]);
  }

  return args;
}

async function withTyping(message, command, fn) {
  if (command.typing === false) return fn();

  await message.channel.sendTyping().catch(() => null);
  return fn();
}

async function memberHasNativeOrFake(message, permission) {
  if (!message.guild || !message.member) return false;
  if (message.member.permissions?.has(permission)) return true;

  try {
    return await db.hasFakePermission(message.guild.id, message.member, permission.toString());
  } catch (error) {
    logger.warn(
      {
        error,
        guildId: message.guild.id,
        userId: message.author.id,
        permission: permission.toString()
      },
      'Fake permission check failed; falling back to native permissions only'
    );

    return false;
  }
}

async function userHasRequiredPermissions(message, permissions = []) {
  if (!permissions.length) return null;

  for (const permission of permissions) {
    const allowed = await memberHasNativeOrFake(message, permission);
    if (!allowed) return permission;
  }

  return null;
}

function botHasRequiredPermissions(message, permissions = []) {
  if (!message.guild || !permissions.length) return null;
  const me = message.guild.members.me;
  const permissionsInChannel = me?.permissionsIn?.(message.channel) || me?.permissions;
  if (!permissionsInChannel) return permissions[0];
  return permissions.find((permission) => !permissionsInChannel.has(permission)) || null;
}

async function handlePrefixCommand(client, message) {
  if (!message.content) return false;
  if (message.author.bot) return false;

  const prefix = await matchPrefix(message);
  if (!prefix) return false;

  const withoutPrefix = message.content.slice(prefix.length).trim();
  if (!withoutPrefix) return false;

  const args = parseArgs(withoutPrefix);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return false;

  let command = client.commands.get(commandName);

  if (!command && isDirectMusicCommand(commandName)) {
    command = client.commands.get('music');
    args.unshift(commandName);
  }

  if (!command) {
    const custom = await runCustomCommand({ message, commandName });
    if (custom.handled) {
      if (custom.error) await safeReply(message, 'bad', custom.error);
      return true;
    }

    const notFound = message.guild
      ? await getCommandNotFoundSettings(message.guild.id).catch(() => ({ enabled: true }))
      : { enabled: true };

    if (notFound.enabled) {
      await safeReply(message, 'bad', `I don't know \`${commandName}\`. Try \`${prefix}help\`.`);
    }
    return true;
  }

  if (command.ownerOnly && !isBotOwner(message.author.id)) {
    await safeReply(message, 'bad', 'That command is only available to my owner.');
    return true;
  }

  if (command.guildOnly && !message.guild) {
    await safeReply(message, 'bad', 'That command only works inside a server.');
    return true;
  }

  if (message.guild && !isBotOwner(message.author.id) && !isProtectedCommand(command.name)) {
    const disabled = await getDisabledCommands(message.guild.id).catch(() => ({}));
    const attemptedSubcommand = args[0] && Array.isArray(command.subcommands)
      ? command.subcommands.find((sub) => {
          const aliases = Array.isArray(sub.aliases) ? sub.aliases : [];
          return [sub.name, ...aliases].map((value) => String(value || '').toLowerCase()).includes(String(args[0]).toLowerCase());
        })?.name || null
      : null;

    if (isCommandDisabled(disabled, command.name, attemptedSubcommand)) {
      await safeReply(message, 'alert', `\`${attemptedSubcommand ? `${command.name} ${attemptedSubcommand}` : command.name}\` is disabled in this server right now.`);
      return true;
    }
  }

  if (message.guild && command.permissions?.length && !isBotOwner(message.author.id)) {
    const missing = await userHasRequiredPermissions(message, command.permissions);

    if (missing) {
      await safeReply(message, 'bad', `You need ${permissionLabel(missing)} to use that.`);
      return true;
    }
  }

  if (message.guild && command.botPermissions?.length) {
    const missing = botHasRequiredPermissions(message, command.botPermissions);

    if (missing) {
      await safeReply(message, 'bad', `I couldn't do that because I'm missing ${permissionLabel(missing)}.`);
      return true;
    }
  }

  const cooldownSeconds = Number(command.cooldown || 0);

  if (cooldownSeconds > 0 && !isBotOwner(message.author.id)) {
    const cooldown = checkCooldown({
      guildId: message.guild?.id || 'dm',
      userId: message.author.id,
      commandName: command.name,
      seconds: cooldownSeconds
    });

    if (!cooldown.ok) {
      await safeReply(
        message,
        'alert',
        `That command is on cooldown. Try again in **${formatRemaining(cooldown.remainingMs)}**.`
      );
      return true;
    }

    setCooldown({
      guildId: message.guild?.id || 'dm',
      userId: message.author.id,
      commandName: command.name,
      seconds: cooldownSeconds
    });
  }

  try {
    await withTyping(message, command, async () => {
      await command.execute({
        client,
        message,
        args,
        prefix,
        commandName
      });
    });
  } catch (error) {
    logger.error(
      {
        error,
        command: command.name,
        guildId: message.guild?.id,
        userId: message.author.id
      },
      'Prefix command failed'
    );

    await safeReply(
      message,
      'bad',
      `Something broke while running \`${command.name}\`. I logged the error.`
    ).catch(() => null);
  }

  return true;
}

module.exports = {
  handlePrefixCommand,
  parseArgs,
  userHasRequiredPermissions,
  botHasRequiredPermissions
};
