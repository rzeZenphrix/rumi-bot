const fs = require('node:fs');
const path = require('node:path');
const logger = require('../systems/logging/logger');
const { normalizeCommandMeta } = require('../utils/normalizeCommandMeta');
const { createCommandRegistry } = require('./commandRegistry');
const { logEventError } = require('../utils/discordErrors');

function walkJsFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkJsFiles(fullPath));
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function loadCommands(client) {
  const registry = createCommandRegistry({ logger });

  const roots = [
    path.join(process.cwd(), 'src', 'commands'),
    path.join(process.cwd(), 'src', 'commands.js')
  ];

  for (const root of roots) {
    for (const file of walkJsFiles(root)) {
      try {
        if (/[\\/]actions[\\/]/.test(file)) {
          continue;
        }

        delete require.cache[require.resolve(file)];

        const command = normalizeCommandMeta(require(file));

        if (!command?.name || typeof command.execute !== 'function') {
          logger.warn(
            {
              file,
              exportedKeys: command ? Object.keys(command) : []
            },
            'Skipped command because it is not prefix-command format'
          );

          continue;
        }

        registry.registerCommand(command, file);

        logger.info(
          {
            command: command.name,
            aliases: command.aliases || [],
            subcommands: command.subcommands?.length || 0,
            catalogEntries: command.catalogEntries?.length || 0,
            file
          },
          'Loaded prefix command'
        );
      } catch (error) {
        logger.error(
          {
            error,
            file
          },
          'Failed to load command'
        );
      }
    }
  }

  registry.attachToClient(client);

  logger.info(
    {
      stats: registry.stats,
      collisions: registry.collisions,
      commandKeys: [...client.commands.keys()]
    },
    'Command loading complete'
  );
}

function loadEvents(client) {
  const root = path.join(process.cwd(), 'src', 'events');
  let loadedCount = 0;

  for (const file of walkJsFiles(root)) {
    try {
      delete require.cache[require.resolve(file)];

      const event = require(file);

      if (!event?.name || typeof event.execute !== 'function') {
        logger.warn(
          {
            file,
            exportedKeys: event ? Object.keys(event) : []
          },
          'Skipped event because it is not event format'
        );

        continue;
      }

      const handler = (...args) => {
        event.execute(client, ...args).catch((error) => {
          logEventError({
            eventName: event.name,
            file,
            metadata: { args: args.map((item) => item?.id || item?.guild?.id || item?.constructor?.name || typeof item) }
          }, error).catch(() => null);
        });
      };

      if (event.once) {
        client.once(event.name, handler);
      } else {
        client.on(event.name, handler);
      }

      loadedCount += 1;

      logger.info(
        {
          event: event.name,
          file
        },
        'Loaded event'
      );
    } catch (error) {
      logger.error(
        {
          error,
          file
        },
        'Failed to load event'
      );
    }
  }

  logger.info(
    {
      loadedCount
    },
    'Event loading complete'
  );
}

module.exports = {
  walkJsFiles,
  loadCommands,
  loadEvents
};
