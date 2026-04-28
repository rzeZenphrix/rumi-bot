const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const logger = require('../systems/logging/logger');
const { normalizeCommandMeta } = require('../utils/normalizeCommandMeta');

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

  return files;
}

function loadCommands(client) {
  client.commands = new Collection();

  const roots = [
    path.join(process.cwd(), 'src', 'commands'),
    path.join(process.cwd(), 'src', 'commands.js')
  ];

  let loadedCount = 0;

  for (const root of roots) {
    for (const file of walkJsFiles(root)) {
      try {
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

        client.commands.set(command.name, command);

        for (const alias of command.aliases || []) {
          client.commands.set(alias, command);
        }

        loadedCount += 1;

        logger.info(
          {
            command: command.name,
            aliases: command.aliases || [],
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

  logger.info(
    {
      loadedCount,
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
          logger.error(
            {
              error,
              event: event.name,
              file
            },
            'Event failed'
          );
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
