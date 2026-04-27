const { Events } = require('discord.js');
const { handleTicketInteraction } = require('../../systems/tickets/ticketManager');
const helpCommand = require('../../commands.js/misc/help');
const serverPremiumCommand = require('../../commands.js/core/serverpremium');
const variablesCommand = require('../../commands.js/utility/variables');

module.exports = {
  name: Events.InteractionCreate,
  async execute(_client, interaction) {
    if (await handleTicketInteraction(interaction).catch(() => false)) {
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

    // Slash commands intentionally disabled for the MVP.
    // Prefix commands are handled in messageCreate.
  }
};
