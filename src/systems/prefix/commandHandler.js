const logger = require('../logging/logger');
const { matchPrefix } = require('./prefixManager');
const respond = require('../../utils/respond');
const { isBotOwner } = require('../owner/ownerManager');
const { checkCooldown, setCooldown, formatRemaining } = require('../cooldowns/cooldownManager.js');

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

  const command = client.commands.get(commandName);

  if (!command) {
    await respond.reply(message, 'bad', `I don’t know \`${commandName}\`. Try \`${prefix}help\`.`);
    return true;
  }

  if (command.ownerOnly && !isBotOwner(message.author.id)) {
    await respond.reply(message, 'bad', 'That command is only available to my owner.');
    return true;
  }

  if (command.guildOnly && !message.guild) {
    await respond.reply(message, 'bad', 'That command only works inside a server.');
    return true;
  }

  if (message.guild && command.permissions?.length) {
    const allowed = command.permissions.every((permission) => {
      return message.member?.permissions?.has(permission);
    });

    if (!allowed && !isBotOwner(message.author.id)) {
      await respond.reply(message, 'bad', 'You don’t have the required permissions for that.');
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
      await respond.reply(
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

    await respond.reply(
      message,
      'bad',
      `Something broke while running \`${command.name}\`. I logged the error.`
    ).catch(() => null);
  }

  return true;
}

module.exports = {
  handlePrefixCommand,
  parseArgs
};