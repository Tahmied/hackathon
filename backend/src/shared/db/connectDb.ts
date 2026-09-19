import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

export async function connectDb(): Promise<mongoose.Connection> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  logger.info(`mongo connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/**
 * Runs `fn` inside a multi-document ACID transaction with the write concern
 * Atlas requires, retrying once on transient transaction errors.
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority' },
      },
    );
    return result as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // One retry for transient commit races (label-based retry semantics)
    if (message.includes('TransientTransactionError') || message.includes('WriteConflict')) {
      logger.warn('transient transaction error — retrying once');
      const retrySession = await mongoose.startSession();
      try {
        let result: T | undefined;
        await retrySession.withTransaction(
          async () => {
            result = await fn(retrySession);
          },
          {
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority' },
          },
        );
        return result as T;
      } finally {
        await retrySession.endSession();
      }
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
