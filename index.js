/**
 * Entry point for the Hello Cat web terminal.
 *
 * Run with:  npm run web
 */

import 'dotenv/config';
import { loadWebConfig, assertWebConfig, webConfigWarnings } from './lib/config.js';
import { createLogger } from './src/utils/logger.js';
import { createWebServer } from './server.js';

async function main() {
  const config = loadWebConfig();
  const logger = createLogger({ dir: config.logDir, name: 'web' });

  assertWebConfig(config);

  for (const warning of webConfigWarnings(config)) {
    logger.warn(warning);
  }

  const app = await createWebServer({ config, logger });

  // Fail fast on a wrong OAuth2 client secret: Discord would otherwise only
  // complain during the token exchange, after the user has already approved
  // the application in the browser.
  const probe = await app.auth.verifyClientCredentials({
    redirectUri: config.redirectUri || `${config.webBaseUrl}/auth/callback`,
  });
  if (probe.ok) {
    logger.info('Discord OAuth2 client credentials accepted', {
      stage: 'auth.credentials',
      clientId: config.clientId,
    });
    if (config.CLIENT_ID && config.clientId !== config.CLIENT_ID) {
      logger.info('The web terminal signs in with a separate Discord application', {
        stage: 'auth.credentials',
        webClientId: config.clientId,
        botClientId: config.CLIENT_ID,
      });
    }
  } else if (probe.reason === 'invalid_client') {
    logger.error(
      'Discord rejected the OAuth2 client credentials (invalid_client). Set DISCORD_CLIENT_SECRET to the current client secret of the application in the Discord developer portal.',
      { stage: 'auth.credentials', clientId: config.clientId, detail: probe.detail },
    );
  } else {
    logger.warn('Could not verify the Discord OAuth2 client credentials', {
      stage: 'auth.credentials',
      reason: probe.reason,
      detail: probe.detail,
    });
  }

  app.server.listen(config.webPort, config.webHost, () => {
    logger.info('Hello Cat web terminal listening', {
      host: config.webHost,
      port: config.webPort,
      baseUrl: config.webBaseUrl,
      redirectUri: config.redirectUri || '(derived from the request host)',
      cookieSecure: config.cookieSecure,
      trustProxy: config.trustProxy,
      clientId: config.clientId,
    });
    console.log(`\n  \x1b[1;32mHello Cat web terminal\x1b[0m running on ${config.webBaseUrl}\n`);
  });

  const shutdown = async (signal) => {
    logger.info('Web terminal shutting down', { signal });
    await app.shutdown().catch(() => {});
    app.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection in web terminal', { error: error?.message ?? String(error) });
  });
}

main().catch((error) => {
  console.error(`\n[WEB TERMINAL FAILED] ${error.message}\n`);
  process.exitCode = 1;
});
