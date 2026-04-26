const pino = require('pino');

let logger;

try {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  logger = pino({
    level: process.env.LOG_LEVEL || 'error',
    serializers: {
      error: pino.stdSerializers.err,
      err: pino.stdSerializers.err
    },
    transport:
      isDevelopment && (process.env.LOG_LEVEL || 'error') !== 'error'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname'
            }
          }
        : undefined,
    base: {
      service: 'rumi-bot'
    }
  });
} catch (error) {
  console.error('Failed to initialize Pino logger. Falling back to console.', error);

  logger = {
    info: () => {},
    warn: () => {},
    error: console.error,
    fatal: console.error,
    debug: () => {}
  };
}

if (typeof logger.fatal !== 'function') logger.fatal = logger.error || console.error;
if (typeof logger.error !== 'function') logger.error = console.error;
if (typeof logger.warn !== 'function') logger.warn = () => {};
if (typeof logger.info !== 'function') logger.info = () => {};
if (typeof logger.debug !== 'function') logger.debug = () => {};

module.exports = logger;