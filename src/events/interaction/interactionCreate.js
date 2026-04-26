const {
  createTicketFromInteraction,
  claimTicketFromInteraction,
  closeTicketFromInteraction
} = require('../../systems/tickets/ticketInteractions');

function findInteraction(inputs) {
  for (const item of inputs) {
    if (!item) continue;

    if (
      typeof item.isButton === 'function' ||
      typeof item.isStringSelectMenu === 'function' ||
      typeof item.isChatInputCommand === 'function'
    ) {
      return item;
    }

    if (
      item.interaction &&
      (
        typeof item.interaction.isButton === 'function' ||
        typeof item.interaction.isStringSelectMenu === 'function' ||
        typeof item.interaction.isChatInputCommand === 'function'
      )
    ) {
      return item.interaction;
    }
  }

  return null;
}

async function safeError(interaction, text) {
  if (!interaction) return;

  const payload = {
    content: text,
    ephemeral: true,
    allowedMentions: { parse: [] }
  };

  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }

    if (typeof interaction.reply === 'function') {
      return interaction.reply(payload);
    }
  } catch {
    return null;
  }

  return null;
}

module.exports = {
  name: 'interactionCreate',

  async execute(...inputs) {
    const interaction = findInteraction(inputs);

    if (!interaction) {
      console.error('[interactionCreate] Could not find Discord interaction object.');
      return;
    }

    try {
      if (typeof interaction.isButton === 'function' && interaction.isButton()) {
        const customId = interaction.customId || '';

        if (customId.startsWith('ticket:create:')) {
          await interaction.deferReply({ ephemeral: true });

          const typeKey = customId.split(':')[2];

          return createTicketFromInteraction(interaction, typeKey);
        }

        if (customId === 'ticket:claim') {
          await interaction.deferReply({ ephemeral: false });
          return claimTicketFromInteraction(interaction);
        }

        if (customId === 'ticket:close') {
          await interaction.deferReply({ ephemeral: false });
          return closeTicketFromInteraction(interaction);
        }

        return;
      }

      if (
        typeof interaction.isStringSelectMenu === 'function' &&
        interaction.isStringSelectMenu()
      ) {
        if (interaction.customId === 'ticket:select') {
          await interaction.deferReply({ ephemeral: true });

          const typeKey = interaction.values?.[0];

          return createTicketFromInteraction(interaction, typeKey);
        }

        return;
      }

      if (
        typeof interaction.isChatInputCommand === 'function' &&
        interaction.isChatInputCommand()
      ) {
        const command =
          interaction.client.slashCommands?.get(interaction.commandName) ||
          interaction.client.commands?.get(interaction.commandName);

        if (!command || typeof command.execute !== 'function') return;

        return command.execute({
          interaction,
          client: interaction.client
        });
      }
    } catch (error) {
      console.error('[interactionCreate]', error);

      return safeError(
        interaction,
        'Something went wrong while processing that interaction.'
      );
    }
  }
};