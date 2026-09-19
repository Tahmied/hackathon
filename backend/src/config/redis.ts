import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../shared/utils/logger.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      lazyConnect: false,
    });
    client.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));
    client.on('ready', () => logger.info('redis connected'));
  }
  return client;
}

/** All redis helpers swallow errors — the DB stays authoritative when redis is down. */
export async function redisGet(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key);
  } catch {
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, value, 'EX', ttlSeconds);
  } catch {
    /* noop */
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    /* noop */
  }
}

export async function redisDelPrefix(prefix: string): Promise<void> {
  try {
    const keys = await getRedis().keys(`${prefix}*`);
    if (keys.length > 0) await getRedis().del(...keys);
  } catch {
    /* noop */
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = await redisGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function redisIsHealthy(): boolean {
  return client?.status === 'ready';
}
