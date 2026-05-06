const { Events } = require('discord.js');
const { handleTicketInteraction } = require('../../systems/tickets/ticketManager');
const { handleSlashCommandInteraction } = require('../../systems/slashCommands');
const { handlePagedMessageInteraction } = require('../../utils/pagedMessages');
const { musicSlashOwnedBySidecar } = require('../../systems/slashManifest');
const { handleVerificationInteraction } = require('../../systems/verification/verificationManager');
const { handleDisboardBumpInteraction } = require('../../systems/bump/disboardBumpReminder');
const { handleGiveawayButton } = require('../../systems/giveaways/manager');

function getCommand(client, ...names) {
  for (const name of names) {
    const command = client.commands?.get?.(name);
    if (command) return command;
  }

  for (const command of client.commands?.values?.() || []) {
    if (!command?.name) continue;
    if (names.includes(command.name)) return command;
    if (command.aliases?.some((alias) => names.includes(alias))) return command;
  }

  return null;
}

async function runCommandInteractionHandler(client, interaction, commandNames, handlerNames) {
  const command = getCommand(client, ...commandNames);
  if (!command) return false;

  for (const handlerName of handlerNames) {
    const handler = command[handlerName];

    if (typeof handler !== 'function') continue;

    const handled = await handler.call(command, interaction).catch(() => false);
    if (handled) return true;
  }

  return false;
}

function getHelpCommand(client) {
  const command = getCommand(client, 'help', 'commands', 'cmds');
  if (command?.handleHelpInteraction) return command;

  for (const candidate of client.commands?.values?.() || []) {
    if (typeof candidate?.handleHelpInteraction === 'function') {
      return candidate;
    }
  }

  return null;
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(client, interaction) {
    if (interaction.isChatInputCommand?.()) {
      if (musicSlashOwnedBySidecar() && ['music', 'spotify'].includes(interaction.commandName)) {
        return;
      }

      if (await handleSlashCommandInteraction(interaction).catch(() => false)) {
        return;
      }

      await interaction.reply({
        content: 'This slash command is currently unavailable. Try syncing commands again, or use the prefix version for now.',
        ephemeral: true
      }).catch(() => null);

      return;
    }

    /**
     * Handle help buttons first so the generic paged-message system
     * does not accidentally capture help navigation.
     */
    if (interaction.isButton?.() && interaction.customId?.startsWith('help:')) {
      const helpCommand = getHelpCommand(client);

      if (helpCommand?.handleHelpInteraction) {
        const handled = await helpCommand.handleHelpInteraction(interaction).catch(() => false);
        if (handled) return;
      }

      await interaction.reply({
        content: 'The help system is still loading. Try again in a moment.',
        ephemeral: true
      }).catch(() => null);

      return;
    }

    if (interaction.isButton?.() && interaction.customId?.startsWith('giveaway:')) {
      if (await handleGiveawayButton(interaction).catch(() => false)) {
        return;
      }
    }

    if (await handleVerificationInteraction(interaction).catch((error) => {
      console.error('[VERIFICATION INTERACTION ERROR]', error);
      return false;
    })) {
      return;
    }

    if (await handleDisboardBumpInteraction(client, interaction).catch(() => false)) {
      return;
    }

    if (await handleTicketInteraction(interaction).catch(() => false)) {
      return;
    }

    if (await handlePagedMessageInteraction(interaction).catch(() => false)) {
      return;
    }

    if (
      await runCommandInteractionHandler(
        client,
        interaction,
        ['rps', 'rockpaperscissors', 'rock-paper-scissors'],
        ['handleRpsInteraction']
      )
    ) {
      return;
    }

    if (
      await runCommandInteractionHandler(
        client,
        interaction,
        ['mines'],
        ['handleMinesInteraction']
      )
    ) {
      return;
    }

    if (
      await runCommandInteractionHandler(
        client,
        interaction,
        ['tictactoe', 'ttt'],
        ['handleTicTacToeInteraction']
      )
    ) {
      return;
    }

    if (
      await runCommandInteractionHandler(
        client,
        interaction,
        ['variables', 'vars'],
        ['handleVariablesInteraction']
      )
    ) {
      return;
    }

    if (
      await runCommandInteractionHandler(
        client,
        interaction,
        ['serverpremium', 'server-premium', 'guildpremium', 'guild-premium'],
        ['handleServerPremiumInteraction']
      )
    ) {
      return;
    }

    // Prefix commands are handled in messageCreate.
  }
};
