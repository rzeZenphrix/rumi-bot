async function fetchAllGuildMembers(guild) {
  if (!guild?.members?.fetch) {
    throw new Error('Guild member manager is unavailable.');
  }

  try {
    return await guild.members.fetch({ withPresences: false });
  } catch (error) {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || 0);
    const reason =
      code === 50001 || code === 50013 || status === 403
        ? 'Discord denied member access. Enable the Server Members privileged intent for Rumi and make sure the bot is still in the server.'
        : error?.message || 'Discord did not return the full member list.';

    const wrapped = new Error(reason);
    wrapped.cause = error;
    wrapped.code = code || undefined;
    wrapped.status = status || undefined;
    throw wrapped;
  }
}

module.exports = {
  fetchAllGuildMembers
};
