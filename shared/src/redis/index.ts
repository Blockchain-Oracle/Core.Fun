import Redis, { RedisOptions } from 'ioredis';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

export function createRedisClient(config?: RedisConfig): Redis {
  const redisConfig: RedisOptions = {
    host: config?.host || process.env.REDIS_HOST || 'redis',
    port: config?.port || parseInt(process.env.REDIS_PORT || '6379'),
    password: config?.password || process.env.REDIS_PASSWORD,
    db: config?.db || parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: config?.keyPrefix || process.env.REDIS_KEY_PREFIX,
    connectTimeout: config?.connectTimeout || 10000,
    // Connect immediately so commands won't fail early
    lazyConnect: config?.lazyConnect ?? false,
    maxRetriesPerRequest: 3,
    autoResubscribe: true,
    // Keep commands queued until the connection is ready
    enableOfflineQueue: true,
    // Backoff retry strategy
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  };

  const redis = new Redis(redisConfig);

  redis.on('connect', () => {
    console.log('Redis connected');
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });

  return redis;
}

export function createRedisPubClient(config?: RedisConfig): Redis {
  return createRedisClient({ ...config, keyPrefix: undefined });
}

export function createRedisSubClient(config?: RedisConfig): Redis {
  return createRedisClient({ ...config, keyPrefix: undefined });
}

// Default Redis client instances
export const redis = createRedisClient();
export const redisPub = createRedisPubClient();
export const redisSub = createRedisSubClient();

export { Redis };
export default Redis;