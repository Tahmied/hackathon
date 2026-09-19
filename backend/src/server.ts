import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDb } from './shared/db/connectDb.js';
import { logger } from './shared/utils/logger.js';
import { initSocketServer } from './sockets/io.js';
import { startMarketEngine, backfillHistory } from './modules/market/market.engine.js';
import { ensureRbacSeeded } from './modules/permissions/permissions.service.js';
import { registerChatSocketHandlers } from './sockets/chat.socket.js';

async function bootstrap() {
  await connectDb();
  await ensureRbacSeeded();

  const app = createApp();
  const server = http.createServer(app);
  initSocketServer(server);
  registerChatSocketHandlers();
  await backfillHistory().catch(() => undefined);
  await startMarketEngine();

  server.listen(env.PORT, () => {
    logger.info(`🚀 NovaTrade API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info('shutting down...');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
