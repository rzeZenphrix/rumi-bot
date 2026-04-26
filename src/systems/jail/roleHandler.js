const { setupJail, hardenJailPermissions } = require('./setupManager');

async function ensureJailInfrastructure(guild) {
  return setupJail(guild);
}

module.exports = {
  ensureJailInfrastructure,
  hardenJailPermissions
};