const { extractId } = require('./resolveUser');

async function fetchTargetMessage(message, args = []) {
  const first = args[0];
  const explicitId = extractId(first);

  if (explicitId) {
    const target = await message.channel.messages.fetch(explicitId).catch(() => null);
    if (target) return { target, consumedArgs: 1, source: 'id' };
  }

  const referencedId = message.reference?.messageId;
  if (referencedId) {
    const target = await message.channel.messages.fetch(referencedId).catch(() => null);
    if (target) return { target, consumedArgs: 0, source: 'reply' };
  }

  return { target: message, consumedArgs: 0, source: 'self' };
}

module.exports = { fetchTargetMessage };
