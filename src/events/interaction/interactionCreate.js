const { Events } = require('discord.js');
const { handleTicketInteraction } = require('../../systems/tickets/ticketManager');
const helpCommand = require('../../commands.js/misc/help');
const serverPremiumCommand = require('../../commands.js/core/serverpremium');
const variablesCommand = require('../../commands.js/utility/variables');
const { handleSlashCommandInteraction } = require('../../systems/slashCommands');
const { handlePagedMessageInteraction } = require('../../utils/pagedMessages');
const minesCommand = require('../../commands.js/fun/mines');
const tictactoeCommand = require('../../commands.js/fun/tictactoe');
const { musicSlashOwnedBySidecar } = require('../../systems/slashManifest');

module.exports = {
  name: Events.InteractionCreate,
  async execute(_client, interaction) {
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

    if (await handleTicketInteraction(interaction).catch(() => false)) {
      return;
    }

    if (await handlePagedMessageInteraction(interaction).catch(() => false)) {
      return;
    }

    if (await minesCommand.handleMinesInteraction?.(interaction).catch(() => false)) {
      return;
    }

    if (await tictactoeCommand.handleTicTacToeInteraction?.(interaction).catch(() => false)) {
      return;
    }

    if (await helpCommand.handleHelpInteraction?.(interaction).catch(() => false)) {
      return;
    }

    if (await variablesCommand.handleVariablesInteraction?.(interaction).catch(() => false)) {
      return;
    }

    if (await serverPremiumCommand.handleServerPremiumInteraction?.(interaction).catch(() => false)) {
      return;
    }

    // Prefix commands are handled in messageCreate.
  }
};
