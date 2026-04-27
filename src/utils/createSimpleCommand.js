function createSimpleCommand(config) {
  return {
    name: config.name,
    aliases: config.aliases || [],
    category: config.category || 'misc',
    description: config.description || 'No description provided.',
    usage: config.usage || config.name,
    examples: config.examples || [config.name],
    async execute(ctx) {
      return config.execute(ctx);
    }
  };
}

module.exports = {
  createSimpleCommand
};
