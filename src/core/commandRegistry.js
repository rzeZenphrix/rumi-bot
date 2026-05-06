const { Collection } = require('discord.js');

function keyOf(value = '') {
  return String(value || '').trim().toLowerCase();
}

function unique(list = []) {
  return [...new Set((list || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function entryId(type, fullName) {
  return `${type}:${keyOf(fullName).replace(/\s+/g, ':')}`;
}

function isPublicCatalogEntry(entry = {}) {
  if (entry.hidden) return false;
  if (entry.catalog?.visible === false) return false;
  if (entry.visible === false) return false;
  return true;
}

function normalizeVirtualEntry(command, entry) {
  const fullName = String(entry.fullName || entry.name || '').trim().toLowerCase();

  return {
    id: entry.id || entryId(entry.type || 'virtual', fullName),
    type: entry.type || 'virtual',
    name: keyOf(entry.name || fullName),
    fullName,
    parent: entry.parent || command.name,
    category: entry.category || command.category || 'misc',
    module: entry.module || entry.category || command.category || 'misc',
    description: entry.description || command.description || 'No description provided.',
    aliases: unique(entry.aliases || []),
    usage: entry.usage,
    usageLines: entry.usageLines,
    examples: entry.examples,
    exampleLines: entry.exampleLines,
    permissions: entry.permissions || command.permissions || [],
    botPermissions: entry.botPermissions || command.botPermissions || [],
    premium: entry.premium ?? command.premium ?? null,
    nsfw: Boolean(entry.nsfw ?? command.nsfw),
    hidden: Boolean(entry.hidden ?? command.hidden),
    ownerOnly: Boolean(entry.ownerOnly ?? command.ownerOnly),
    guildOnly: Boolean(entry.guildOnly ?? command.guildOnly),
    slash: entry.slash ?? command.slash ?? null,
    flags: entry.flags || [],
    sourceCommandName: command.name,
    source: entry
  };
}

function createCommandRegistry({ logger } = {}) {
  const registry = {
    files: new Map(),
    commands: new Map(),
    aliases: new Map(),
    commandKeys: new Map(),
    entries: new Map(),
    collisions: [],
    stats: {
      filesLoaded: 0,
      baseCommands: 0,
      aliases: 0,
      subcommands: 0,
      virtualEntries: 0,
      publicEntries: 0,
      commandKeys: 0,
      collisions: 0
    },

    warnCollision(payload) {
      this.collisions.push(payload);
      this.stats.collisions = this.collisions.length;

      if (logger?.warn) {
        logger.warn(payload, 'Command registry collision');
      }
    },

    setRuntimeKey(key, command, file, keyType) {
      const normalizedKey = keyOf(key);
      if (!normalizedKey) return;

      const existing = this.commandKeys.get(normalizedKey);

      if (existing && existing.command !== command) {
        this.warnCollision({
          key: normalizedKey,
          keyType,
          existingCommand: existing.command?.name,
          incomingCommand: command.name,
          existingFile: existing.file,
          incomingFile: file,
          resolution: 'last-wins'
        });
      }

      this.commandKeys.set(normalizedKey, { command, file, keyType });

      if (keyType === 'alias') {
        this.aliases.set(normalizedKey, command.name);
      }
    },

    setCatalogEntry(entry) {
      if (!entry?.id) return;

      const existing = this.entries.get(entry.id);

      if (existing) {
        this.warnCollision({
          key: entry.id,
          keyType: 'catalog-entry',
          existingCommand: existing.command?.name || existing.sourceCommandName,
          incomingCommand: entry.command?.name || entry.sourceCommandName,
          existingFile: existing.file,
          incomingFile: entry.file,
          resolution: 'last-wins'
        });
      }

      this.entries.set(entry.id, entry);
    },

    registerCommand(command, file) {
      if (!command?.name || typeof command.execute !== 'function') return false;

      const name = keyOf(command.name);
      const existing = this.commands.get(name);

      if (existing && existing !== command) {
        this.warnCollision({
          key: name,
          keyType: 'command',
          existingCommand: existing.name,
          incomingCommand: command.name,
          existingFile: this.files.get(existing.name),
          incomingFile: file,
          resolution: 'last-wins'
        });
      }

      this.commands.set(name, command);
      this.files.set(name, file);
      this.setRuntimeKey(name, command, file, 'command');

      for (const alias of command.aliases || []) {
        const aliasKey = keyOf(alias);
        if (!aliasKey || aliasKey === name) continue;
        this.setRuntimeKey(aliasKey, command, file, 'alias');
      }

      this.setCatalogEntry({
        id: entryId('command', name),
        type: 'command',
        name,
        fullName: name,
        parent: null,
        category: command.category || 'misc',
        module: command.category || 'misc',
        command,
        file,
        hidden: Boolean(command.hidden),
        ownerOnly: Boolean(command.ownerOnly)
      });

      for (const subcommand of command.subcommands || []) {
        if (!subcommand?.name) continue;

        const fullName = `${name} ${keyOf(subcommand.name)}`;

        this.setCatalogEntry({
          id: entryId('subcommand', fullName),
          type: 'subcommand',
          name: keyOf(subcommand.name),
          fullName,
          parent: name,
          category: command.category || 'misc',
          module: command.category || 'misc',
          command,
          subcommand,
          file,
          hidden: Boolean(subcommand.hidden ?? command.hidden),
          ownerOnly: Boolean(subcommand.ownerOnly ?? command.ownerOnly)
        });

        this.stats.subcommands += 1;
      }

      for (const rawEntry of command.catalogEntries || []) {
        const virtual = normalizeVirtualEntry(command, rawEntry);
        virtual.file = file;
        this.setCatalogEntry(virtual);
        this.stats.virtualEntries += 1;
      }

      if (command.catalog?.aliasesAsCommands === true) {
        const hiddenAliases = new Set((command.catalog?.hiddenAliases || []).map(keyOf));

        for (const alias of command.aliases || []) {
          const aliasKey = keyOf(alias);
          if (!aliasKey || hiddenAliases.has(aliasKey)) continue;

          const fullName = aliasKey;

          this.setCatalogEntry({
            id: entryId('alias-command', fullName),
            type: 'alias-command',
            name: aliasKey,
            fullName,
            parent: name,
            category: command.category || 'misc',
            module: command.category || 'misc',
            description: command.description,
            usage: [`${aliasKey}`],
            examples: [`${aliasKey}`],
            command,
            file,
            hidden: Boolean(command.hidden),
            ownerOnly: Boolean(command.ownerOnly)
          });

          this.stats.virtualEntries += 1;
        }
      }

      this.stats.filesLoaded += 1;
      this.stats.baseCommands = this.commands.size;
      this.stats.aliases = this.aliases.size;
      this.stats.commandKeys = this.commandKeys.size;
      this.stats.publicEntries = [...this.entries.values()].filter(isPublicCatalogEntry).length;

      return true;
    },

    attachToClient(client) {
      const commands = new Collection();

      for (const [key, data] of this.commandKeys.entries()) {
        commands.set(key, data.command);
      }

      client.commands = commands;
      client.commandRegistry = this;

      this.stats.commandKeys = commands.size;
      this.stats.baseCommands = this.commands.size;
      this.stats.aliases = this.aliases.size;
      this.stats.publicEntries = [...this.entries.values()].filter(isPublicCatalogEntry).length;

      return commands;
    },

    getCommands() {
      return [...this.commands.values()];
    },

    getPublicEntries(options = {}) {
      const includeHidden = Boolean(options.includeHidden);
      const includeOwnerOnly = Boolean(options.includeOwnerOnly);

      return [...this.entries.values()]
        .filter((entry) => {
          if (!includeHidden && entry.hidden) return false;
          if (!includeOwnerOnly && entry.ownerOnly) return false;
          return isPublicCatalogEntry(entry) || includeHidden;
        })
        .sort((a, b) => String(a.fullName || a.name).localeCompare(String(b.fullName || b.name)));
    }
  };

  return registry;
}

module.exports = {
  createCommandRegistry,
  keyOf,
  unique
};