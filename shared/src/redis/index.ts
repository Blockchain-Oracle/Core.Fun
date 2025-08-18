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
  // Try to use REDIS_URL first if available
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl && !config) {
    console.log(`[Redis] Connecting using REDIS_URL: ${redisUrl}`);
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      autoResubscribe: true,
      enableOfflineQueue: true,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    
    setupRedisHandlers(redis);
    return redis;
  }
  
  // Fallback to individual config options
  const host = config?.host || process.env.REDIS_HOST || 'redis';
  const port = config?.port || parseInt(process.env.REDIS_PORT || '6379');
  
  console.log(`[Redis] Connecting to ${host}:${port}`);
  
  const redisConfig: RedisOptions = {
    host,
    port,
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
  setupRedisHandlers(redis);
  return redis;
}

function setupRedisHandlers(redis: Redis): void {
  redis.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redis.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...');
  });
}

export function createRedisPubClient(config?: RedisConfig): Redis {
  return createRedisClient({ ...config, keyPrefix: undefined });
}

export function createRedisSubClient(config?: RedisConfig): Redis {
  return createRedisClient({ ...config, keyPrefix: undefined });
}

// Lazy-loaded Redis client instances
let _redis: Redis | null = null;
let _redisPub: Redis | null = null;
let _redisSub: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_redis) {
    _redis = createRedisClient();
  }
  return _redis;
}

export function getRedisPubClient(): Redis {
  if (!_redisPub) {
    _redisPub = createRedisPubClient();
  }
  return _redisPub;
}

export function getRedisSubClient(): Redis {
  if (!_redisSub) {
    _redisSub = createRedisSubClient();
  }
  return _redisSub;
}

// Deprecated: These will be removed in future versions
// Using getters to maintain backward compatibility but lazy-load
export const redis = getRedisClient();
export const redisPub = getRedisPubClient();
export const redisSub = getRedisSubClient();

export { Redis };
export default Redis;