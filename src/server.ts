import { type AppConfig, loadConfig } from './config.js';
import { buildApp } from './http/app.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Invalid configuration: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const app = await buildApp({
  maxFileSizeBytes: config.maxFileSizeBytes,
  logger: { level: config.logLevel },
});

/** In-flight uploads get this long to finish after a shutdown signal. */
const SHUTDOWN_GRACE_MS = 10_000;

// Stop accepting new connections and let in-flight uploads finish before exiting.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    setTimeout(() => {
      app.log.warn('Uploads still running after the grace period; exiting anyway');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'Error while shutting down');
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
}
