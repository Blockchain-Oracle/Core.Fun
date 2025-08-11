import { Knex } from 'knex';
import knex from 'knex';
import { createLogger } from '@core-meme/shared';

interface Subscription {
  id: string;
  clientId: string;
  channel: string;
  params: any;
  createdAt: Date;
  lastActivity: Date;
}

export class SubscriptionManager {
  private db: Knex;
  private logger = createLogger({ service: 'websocket-subscriptions' });

  constructor() {
    // Initialize database connection (shares with blockchain-monitor)
    this.db = knex({
      client: 'pg',
      connection: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'core_meme_platform',
        user: process.env.POSTGRES_USER || 'core_user',
        password: process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
      },
      pool: {
        min: 2,
        max: 10,
      },
    });

    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Create websocket_subscriptions table if it doesn't exist
      if (!(await this.db.schema.hasTable('websocket_subscriptions'))) {
        await this.db.schema.createTable('websocket_subscriptions', (table) => {
          table.string('id').primary();
          table.string('client_id').notNullable();
          table.string('channel').notNullable();
          table.jsonb('params');
          table.timestamp('created_at').defaultTo(this.db.fn.now());
          table.timestamp('last_activity').defaultTo(this.db.fn.now());
          
          table.index(['client_id']);
          table.index(['channel']);
          table.index(['last_activity']);
        });

        this.logger.info('WebSocket subscriptions table created');
      }

      // Create websocket_connections table if it doesn't exist
      if (!(await this.db.schema.hasTable('websocket_connections'))) {
        await this.db.schema.createTable('websocket_connections', (table) => {
          table.string('client_id').primary();
          table.string('ip_address');
          table.timestamp('connected_at').defaultTo(this.db.fn.now());
          table.timestamp('last_ping').defaultTo(this.db.fn.now());
          table.jsonb('metadata');
          
          table.index(['connected_at']);
          table.index(['last_ping']);
        });

        this.logger.info('WebSocket connections table created');
      }
    } catch (error) {
      this.logger.error('Error initializing subscription tables:', error);
      throw error;
    }
  }

  async addSubscription(clientId: string, channel: string, params: any): Promise<void> {
    const id = `${clientId}_${channel}_${Date.now()}`;
    
    await this.db('websocket_subscriptions').insert({
      id,
      client_id: clientId,
      channel,
      params: JSON.stringify(params),
      created_at: new Date(),
      last_activity: new Date(),
    });

    this.logger.info(`Subscription added: ${clientId} -> ${channel}`);
  }

  async removeSubscription(clientId: string, channel: string): Promise<void> {
    await this.db('websocket_subscriptions')
      .where('client_id', clientId)
      .andWhere('channel', channel)
      .delete();

    this.logger.info(`Subscription removed: ${clientId} -> ${channel}`);
  }

  async removeAllSubscriptions(clientId: string): Promise<void> {
    await this.db('websocket_subscriptions')
      .where('client_id', clientId)
      .delete();

    this.logger.info(`All subscriptions removed for client: ${clientId}`);
  }

  async getSubscriptions(clientId: string): Promise<Subscription[]> {
    const subs = await this.db('websocket_subscriptions')
      .where('client_id', clientId)
      .select('*');

    return subs.map(sub => ({
      ...sub,
      params: typeof sub.params === 'string' ? JSON.parse(sub.params) : sub.params,
    }));
  }

  async getSubscribersByChannel(channel: string): Promise<string[]> {
    const subscribers = await this.db('websocket_subscriptions')
      .where('channel', channel)
      .select('client_id')
      .distinct();

    return subscribers.map(s => s.client_id);
  }

  async getSubscribersByTokenAddress(tokenAddress: string): Promise<string[]> {
    // Find all subscribers watching this specific token
    const subscribers = await this.db('websocket_subscriptions')
      .where('channel', 'prices')
      .orWhere('channel', 'trades')
      .select('client_id', 'params');

    const interestedClients: string[] = [];
    
    for (const sub of subscribers) {
      const params = typeof sub.params === 'string' ? JSON.parse(sub.params) : sub.params;
      
      if (params.tokens && Array.isArray(params.tokens)) {
        if (params.tokens.includes(tokenAddress) || params.tokens.includes('*')) {
          interestedClients.push(sub.client_id);
        }
      }
    }

    return [...new Set(interestedClients)]; // Remove duplicates
  }

  async updateActivity(clientId: string): Promise<void> {
    await this.db('websocket_subscriptions')
      .where('client_id', clientId)
      .update({ last_activity: new Date() });
  }

  async cleanupInactiveSubscriptions(maxInactiveMinutes: number = 30): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    
    const deleted = await this.db('websocket_subscriptions')
      .where('last_activity', '<', cutoffTime)
      .delete();

    if (deleted > 0) {
      this.logger.info(`Cleaned up ${deleted} inactive subscriptions`);
    }

    return deleted;
  }

  // Connection management
  async addConnection(clientId: string, ipAddress: string, metadata?: any): Promise<void> {
    await this.db('websocket_connections')
      .insert({
        client_id: clientId,
        ip_address: ipAddress,
        connected_at: new Date(),
        last_ping: new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
      .onConflict('client_id')
      .merge();

    this.logger.info(`Connection registered: ${clientId} from ${ipAddress}`);
  }

  async removeConnection(clientId: string): Promise<void> {
    await this.db('websocket_connections')
      .where('client_id', clientId)
      .delete();

    // Also remove all subscriptions for this client
    await this.removeAllSubscriptions(clientId);

    this.logger.info(`Connection removed: ${clientId}`);
  }

  async updateConnectionPing(clientId: string): Promise<void> {
    await this.db('websocket_connections')
      .where('client_id', clientId)
      .update({ last_ping: new Date() });
  }

  async getActiveConnections(): Promise<number> {
    const result = await this.db('websocket_connections').count('* as count');
    return parseInt(result[0].count as string, 10);
  }

  async getConnectionStats(): Promise<any> {
    const [totalConnections] = await this.db('websocket_connections').count('* as count');
    
    const channelStats = await this.db('websocket_subscriptions')
      .select('channel')
      .count('* as count')
      .groupBy('channel');

    return {
      totalConnections: parseInt(totalConnections.count as string, 10),
      channelStats: channelStats.reduce((acc, row) => {
        acc[row.channel] = parseInt(row.count as string, 10);
        return acc;
      }, {} as Record<string, number>),
    };
  }

  async close(): Promise<void> {
    await this.db.destroy();
  }
}