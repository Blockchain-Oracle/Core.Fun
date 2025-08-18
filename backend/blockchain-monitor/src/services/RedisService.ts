import Redis from 'ioredis';
import { createLogger } from '@core-meme/shared';

export class RedisService {
  private redis: Redis;
  private publisher: Redis;
  private subscriber: Redis;
  private logger = createLogger({ service: 'redis-service' });

  constructor(redisUrlOrInstance?: string | Redis) {
    if (redisUrlOrInstance instanceof Redis) {
      // Clone the Redis instance configuration
      const options = (redisUrlOrInstance as any).options;
      this.redis = new Redis(options);
      this.publisher = new Redis(options);
      this.subscriber = new Redis(options);
    } else {
      const url = redisUrlOrInstance || process.env.REDIS_URL || 'redis://redis:6379';
      
      this.redis = new Redis(url);
      this.publisher = new Redis(url);
      this.subscriber = new Redis(url);
    }
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.logger.info('Redis client connected');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis client error:', error);
    });

    this.publisher.on('connect', () => {
      this.logger.info('Redis publisher connected');
    });

    this.subscriber.on('connect', () => {
      this.logger.info('Redis subscriber connected');
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async publish(channel: string, data: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  async subscribe(channel: string, callback: (data: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          this.logger.error('Error parsing message:', error);
        }
      }
    });
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(key, score, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.zrevrange(key, start, stop);
  }

  async close(): Promise<void> {
    await this.redis.quit();
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}