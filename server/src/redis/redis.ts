import { createClient } from 'redis';

const redisEnvKeys = Object.keys(process.env).filter(k => k.startsWith('REDIS'));
console.log(`Found ${redisEnvKeys.length} Redis variables: [${redisEnvKeys.join(', ')}]`);

let redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

if (!redisUrl && process.env.REDISHOST) {
  const user = process.env.REDISUSER ? `${process.env.REDISUSER}:` : '';
  const pass = (process.env.REDISPASSWORD || process.env.REDIS_PASSWORD) ? `${process.env.REDISPASSWORD || process.env.REDIS_PASSWORD}@` : '';
  redisUrl = `redis://${user}${pass}${process.env.REDISHOST}:${process.env.REDISPORT ?? 6379}`;
}

if (redisUrl) {
  const masked = redisUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`Connecting to Redis at: ${masked}`);
}

if (!redisUrl && process.env.NODE_ENV === 'production' && !process.env.RAILWAY_ENVIRONMENT) {
  throw new Error('❌ CRITICAL: No Redis connection variables found in production environment.');
}

export const redis = createClient({
  url: redisUrl ?? 'redis://localhost:6379',
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
