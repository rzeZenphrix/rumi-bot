const { MessageFlags } = require('discord.js');
const respond = require('../../utils/respond');
const ticketDb = require('./ticketDb');
const ticketManager = require('./ticketManager');

async function createTicketFromInteraction(interaction, typeKey, panelId = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const result = await ticketManager.openTicket({
    guild: interaction.guild,
    member: interaction.member,
    typeKey,
    panelId
  }).catch((error) => ({
    ok: false,
    reason: error?.message || 'I could not create that ticket right now.'
  }));

  const payload = result.ok
    ? { content: `Ticket created: <#${result.channel.id}>`, flags: MessageFlags.Ephemeral }
    : { content: result.reason || 'I could not create that ticket right now.', flags: MessageFlags.Ephemeral };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }

  return result;
}

async function claimTicketFromInteraction(interaction, ticketId = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const ticket =
    (ticketId ? await ticketDb.getTicket(ticketId).catch(() => null) : null) ||
    await ticketDb.getTicketByChannel(interaction.guild.id, interaction.channelId).catch(() => null);

  if (!ticket) {
    const payload = { content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
    return { ok: false, reason: 'This channel is not a ticket.' };
  }

  const result = await ticketManager.claimTicket({
    guild: interaction.guild,
    member: interaction.member,
    ticketId: ticket.id
  }).catch((error) => ({
    ok: false,
    reason: error?.message || 'I could not claim that ticket right now.'
  }));

  const payload = {
    content: result.ok ? 'Ticket claimed.' : (result.reason || 'I could not claim that ticket right now.'),
    flags: MessageFlags.Ephemeral
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }

  return result;
}

async function closeTicketFromInteraction(interaction, ticketId = null, reason = 'Closed from ticket button.') {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const ticket =
    (ticketId ? await ticketDb.getTicket(ticketId).catch(() => null) : null) ||
    await ticketDb.getTicketByChannel(interaction.guild.id, interaction.channelId).catch(() => null);

  if (!ticket) {
    const payload = { content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
    return { ok: false, reason: 'This channel is not a ticket.' };
  }

  const result = await ticketManager.closeTicket({
    guild: interaction.guild,
    member: interaction.member,
    ticketId: ticket.id,
    reason
  }).catch((error) => ({
    ok: false,
    reason: error?.message || 'I could not close that ticket right now.'
  }));

  const payload = {
    content: result.ok ? 'Ticket closed.' : (result.reason || 'I could not close that ticket right now.'),
    flags: MessageFlags.Ephemeral
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }

  return result;
}

module.exports = {
  createTicketFromInteraction,
  claimTicketFromInteraction,
  closeTicketFromInteraction
};
