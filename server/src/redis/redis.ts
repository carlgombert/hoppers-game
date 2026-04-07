import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});

redis.on('error', (err) => console.error('Redis error:', err));

export async function connectRedis() {
  if (redis.isOpen) return;
  await redis.connect();
  console.log('Redis connected');
}

export async function disconnectRedis() {
  if (!redis.isOpen) return;
  await redis.quit();
  console.log('Redis disconnected');
}
