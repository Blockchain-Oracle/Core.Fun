import knex, { Knex } from 'knex';
import winston from 'winston';
import { 
  Token, 
  Pair, 
  Trade, 
  LiquidityEvent, 
  TokenAnalytics,
  Alert 
} from '../types';

export interface TraderProfile {
  address: string;
  totalTrades: number;
  totalVolumeUSD: number;
  profitLoss: number;
  winRate: number;
  avgTradeSize: number;
  firstTrade: number;
  lastTrade: number;
  favoriteTokens: string[];
  isWhale?: boolean;
}

export class DatabaseService {
  private db: Knex;
  private logger: winston.Logger;

  constructor(config?: Knex.Config) {
    // Initialize database connection
    this.db = knex(config || {
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

    // Initialize logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: 'database.log' 
        }),
      ],
    });

    // Initialize tables
    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Create tokens table
      if (!(await this.db.schema.hasTable('tokens'))) {
        await this.db.schema.createTable('tokens', (table) => {
          table.string('address').primary();
          table.string('name');
          table.string('symbol');
          table.integer('decimals');
          table.string('total_supply');
          table.string('creator');
          table.bigInteger('created_timestamp');
          table.integer('block_number');
          table.string('transaction_hash');
          table.boolean('is_verified').defaultTo(false);
          table.text('description');
          table.string('website');
          table.string('twitter');
          table.string('telegram');
          table.string('status').defaultTo('CREATED');
          table.boolean('ownership_renounced').defaultTo(false);
          table.timestamps(true, true);
          
          table.index(['created_timestamp']);
          table.index(['symbol']);
          table.index(['creator']);
        });
      }

      // Create pairs table
      if (!(await this.db.schema.hasTable('pairs'))) {
        await this.db.schema.createTable('pairs', (table) => {
          table.string('address').primary();
          table.string('token0');
          table.string('token1');
          table.string('reserve0');
          table.string('reserve1');
          table.string('total_supply');
          table.string('dex');
          table.bigInteger('pair_created_at'); // Renamed to avoid conflict
          table.integer('block_number');
          table.string('transaction_hash');
          table.timestamps(true, true);
          
          table.index(['token0']);
          table.index(['token1']);
          table.index(['dex']);
          table.index(['pair_created_at']);
        });
      }

      // Create trades table
      if (!(await this.db.schema.hasTable('trades'))) {
        await this.db.schema.createTable('trades', (table) => {
          table.string('transaction_hash').primary();
          table.integer('block_number');
          table.bigInteger('timestamp');
          table.string('pair');
          table.string('trader');
          table.string('token_in');
          table.string('token_out');
          table.string('amount_in');
          table.string('amount_out');
          table.float('price_impact');
          table.string('gas_used');
          table.string('gas_price');
          table.timestamps(true, true);
          
          table.index(['timestamp']);
          table.index(['pair']);
          table.index(['trader']);
          table.index(['token_in']);
          table.index(['token_out']);
        });
      }

      // Create liquidity_events table
      if (!(await this.db.schema.hasTable('liquidity_events'))) {
        await this.db.schema.createTable('liquidity_events', (table) => {
          table.increments('id').primary();
          table.string('transaction_hash');
          table.integer('block_number');
          table.bigInteger('timestamp');
          table.string('pair');
          table.string('provider');
          table.string('token0_amount');
          table.string('token1_amount');
          table.string('liquidity');
          table.enum('type', ['ADD', 'REMOVE']);
          table.timestamps(true, true);
          
          table.index(['timestamp']);
          table.index(['pair']);
          table.index(['provider']);
        });
      }

      // Create token_analytics table
      if (!(await this.db.schema.hasTable('token_analytics'))) {
        await this.db.schema.createTable('token_analytics', (table) => {
          table.string('address').primary();
          table.float('rug_score');
          table.boolean('is_honeypot');
          table.float('ownership_concentration');
          table.float('liquidity_usd');
          table.float('volume_24h');
          table.integer('holders');
          table.integer('transactions_24h');
          table.float('price_usd');
          table.float('price_change_24h');
          table.float('market_cap_usd');
          table.string('circulating_supply');
          table.float('max_wallet_percent');
          table.float('max_transaction_percent');
          table.float('buy_tax');
          table.float('sell_tax');
          table.boolean('is_renounced');
          table.boolean('liquidity_locked');
          table.bigInteger('liquidity_lock_expiry');
          table.timestamps(true, true);
        });
      }

      // Create alerts table
      if (!(await this.db.schema.hasTable('alerts'))) {
        await this.db.schema.createTable('alerts', (table) => {
          table.string('id').primary();
          table.enum('type', [
            'NEW_TOKEN', 'NEW_PAIR', 'LARGE_BUY', 'LARGE_SELL',
            'LIQUIDITY_ADDED', 'LIQUIDITY_REMOVED', 'RUG_WARNING',
            'HONEYPOT_DETECTED', 'WHALE_ACTIVITY'
          ]);
          table.enum('severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
          table.string('token_address');
          table.text('message');
          table.jsonb('data');
          table.bigInteger('timestamp');
          table.boolean('sent').defaultTo(false);
          table.timestamps(true, true);
          
          table.index(['timestamp']);
          table.index(['token_address']);
          table.index(['type']);
        });
      }

      // Create trader_profiles table
      if (!(await this.db.schema.hasTable('trader_profiles'))) {
        await this.db.schema.createTable('trader_profiles', (table) => {
          table.string('address').primary();
          table.integer('total_trades');
          table.float('total_volume_usd');
          table.float('profit_loss');
          table.float('win_rate');
          table.float('avg_trade_size');
          table.bigInteger('first_trade');
          table.bigInteger('last_trade');
          table.specificType('favorite_tokens', 'text[]');
          table.boolean('is_whale').defaultTo(false);
          table.timestamps(true, true);
          
          table.index(['total_volume_usd']);
          table.index(['is_whale']);
        });
      }

      // Create hourly_volume table
      if (!(await this.db.schema.hasTable('hourly_volume'))) {
        await this.db.schema.createTable('hourly_volume', (table) => {
          table.increments('id').primary();
          table.string('pair');
          table.string('token');
          table.integer('hour');
          table.float('volume');
          table.integer('trade_count');
          table.timestamps(true, true);
          
          table.unique(['pair', 'hour']);
          table.index(['token', 'hour']);
        });
      }

      // Create daily_volume table
      if (!(await this.db.schema.hasTable('daily_volume'))) {
        await this.db.schema.createTable('daily_volume', (table) => {
          table.increments('id').primary();
          table.string('pair');
          table.string('token');
          table.integer('day');
          table.float('volume');
          table.integer('trade_count');
          table.float('high_price');
          table.float('low_price');
          table.float('open_price');
          table.float('close_price');
          table.timestamps(true, true);
          
          table.unique(['pair', 'day']);
          table.index(['token', 'day']);
        });
      }

      this.logger.info('Database tables initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing database tables:', error);
      throw error;
    }
  }

  // Token methods
  async saveToken(token: Token): Promise<void> {
    await this.db('tokens').insert(token).onConflict('address').merge();
  }

  async updateToken(token: Partial<Token>): Promise<void> {
    await this.db('tokens').where('address', token.address).update(token);
  }

  async getToken(address: string): Promise<Token | null> {
    const token = await this.db('tokens').where('address', address.toLowerCase()).first();
    return token || null;
  }

  async updateTokenStatus(address: string, status: string): Promise<void> {
    await this.db('tokens').where('address', address.toLowerCase()).update({ status });
  }

  async updateTokenOwnership(address: string, renounced: boolean): Promise<void> {
    await this.db('tokens')
      .where('address', address.toLowerCase())
      .update({ ownership_renounced: renounced });
  }

  // Pair methods
  async savePair(pair: Pair): Promise<void> {
    await this.db('pairs').insert(pair).onConflict('address').merge();
  }

  async updatePairReserves(address: string, reserve0: string, reserve1: string): Promise<void> {
    await this.db('pairs')
      .where('address', address.toLowerCase())
      .update({ reserve0, reserve1 });
  }

  // Trade methods
  async saveTrade(trade: Trade): Promise<void> {
    await this.db('trades').insert(trade).onConflict('transaction_hash').merge();
  }

  async getRecentTrades(tokenAddress: string, limit: number = 100): Promise<Trade[]> {
    return await this.db('trades')
      .where('token_in', tokenAddress.toLowerCase())
      .orWhere('token_out', tokenAddress.toLowerCase())
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }

  // Liquidity methods
  async saveLiquidityEvent(event: LiquidityEvent): Promise<void> {
    await this.db('liquidity_events').insert(event);
  }

  // Analytics methods
  async saveTokenAnalytics(analytics: TokenAnalytics): Promise<void> {
    await this.db('token_analytics')
      .insert(analytics)
      .onConflict('address')
      .merge();
  }

  async getTokenAnalytics(address: string): Promise<TokenAnalytics | null> {
    const analytics = await this.db('token_analytics')
      .where('address', address.toLowerCase())
      .first();
    return analytics || null;
  }

  // Alert methods
  async saveAlert(alert: Alert): Promise<void> {
    await this.db('alerts').insert(alert).onConflict('id').merge();
  }

  async getUnsentAlerts(): Promise<Alert[]> {
    return await this.db('alerts')
      .where('sent', false)
      .orderBy('timestamp', 'desc')
      .limit(100);
  }

  async markAlertSent(id: string): Promise<void> {
    await this.db('alerts').where('id', id).update({ sent: true });
  }

  // Trader profile methods
  async getTraderProfile(address: string): Promise<TraderProfile | null> {
    const profile = await this.db('trader_profiles')
      .where('address', address.toLowerCase())
      .first();
    return profile || null;
  }

  async saveTraderProfile(profile: TraderProfile): Promise<void> {
    await this.db('trader_profiles')
      .insert(profile)
      .onConflict('address')
      .merge();
  }

  async markAsWhale(address: string): Promise<void> {
    await this.db('trader_profiles')
      .where('address', address.toLowerCase())
      .update({ is_whale: true });
  }

  // Volume tracking methods
  async updateHourlyVolume(pair: string, hour: number, trade: Trade): Promise<void> {
    const existing = await this.db('hourly_volume')
      .where({ pair: pair.toLowerCase(), hour })
      .first();

    if (existing) {
      await this.db('hourly_volume')
        .where({ pair: pair.toLowerCase(), hour })
        .increment('volume', parseFloat(trade.amountIn))
        .increment('trade_count', 1);
    } else {
      await this.db('hourly_volume').insert({
        pair: pair.toLowerCase(),
        hour,
        volume: parseFloat(trade.amountIn),
        trade_count: 1,
      });
    }
  }

  async updateDailyVolume(pair: string, day: number, trade: Trade): Promise<void> {
    const existing = await this.db('daily_volume')
      .where({ pair: pair.toLowerCase(), day })
      .first();

    if (existing) {
      await this.db('daily_volume')
        .where({ pair: pair.toLowerCase(), day })
        .increment('volume', parseFloat(trade.amountIn))
        .increment('trade_count', 1);
    } else {
      await this.db('daily_volume').insert({
        pair: pair.toLowerCase(),
        day,
        volume: parseFloat(trade.amountIn),
        trade_count: 1,
      });
    }
  }

  async updateTokenHourlyVolume(token: string, hour: number, trade: Trade): Promise<void> {
    const existing = await this.db('hourly_volume')
      .where({ token: token.toLowerCase(), hour })
      .first();

    const volume = trade.tokenIn === token ? 
      parseFloat(trade.amountIn) : 
      parseFloat(trade.amountOut);

    if (existing) {
      await this.db('hourly_volume')
        .where({ token: token.toLowerCase(), hour })
        .increment('volume', volume)
        .increment('trade_count', 1);
    } else {
      await this.db('hourly_volume').insert({
        token: token.toLowerCase(),
        hour,
        volume,
        trade_count: 1,
      });
    }
  }

  async updateTokenDailyVolume(token: string, day: number, trade: Trade): Promise<void> {
    const existing = await this.db('daily_volume')
      .where({ token: token.toLowerCase(), day })
      .first();

    const volume = trade.tokenIn === token ? 
      parseFloat(trade.amountIn) : 
      parseFloat(trade.amountOut);

    if (existing) {
      await this.db('daily_volume')
        .where({ token: token.toLowerCase(), day })
        .increment('volume', volume)
        .increment('trade_count', 1);
    } else {
      await this.db('daily_volume').insert({
        token: token.toLowerCase(),
        day,
        volume,
        trade_count: 1,
      });
    }
  }

  async incrementTokenVolume(token: string, trade: Trade): Promise<void> {
    // This is handled by updateTokenHourlyVolume and updateTokenDailyVolume
    const hour = Math.floor(trade.timestamp / 3600000);
    const day = Math.floor(trade.timestamp / 86400000);
    
    await this.updateTokenHourlyVolume(token, hour, trade);
    await this.updateTokenDailyVolume(token, day, trade);
  }

  async incrementTokenTransactions(token: string): Promise<void> {
    // Update token analytics transaction count
    await this.db('token_analytics')
      .where('address', token.toLowerCase())
      .increment('transactions_24h', 1);
  }

  // Token launch and events
  async saveTokenLaunch(data: any): Promise<void> {
    await this.db('tokens')
      .where('address', data.token.toLowerCase())
      .update({
        status: 'LAUNCHED',
        updated_at: this.db.fn.now(),
      });
  }

  async saveTokenEvent(event: any): Promise<void> {
    // Could create a separate events table if needed
    this.logger.info('Token event saved:', event);
  }

  // Cleanup
  async close(): Promise<void> {
    await this.db.destroy();
  }
}