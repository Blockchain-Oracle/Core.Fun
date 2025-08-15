import { Pool } from 'pg';
import { createLogger } from '../logger';
import {
  User,
  Wallet,
  Trade,
  Token,
  Pair,
  TokenAnalytics,
  Alert
} from '../database/types';

// Additional interfaces
export interface Position {
  id: string;
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
  initialInvestment: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  firstBuyTime: Date;
  lastUpdateTime: Date;
  trades: number;
  isActive: boolean;
}

export interface CopyTradeSettings {
  id?: string;
  userId: string;
  targetWallet: string;
  enabled: boolean;
  copyBuys: boolean;
  copySells: boolean;
  maxAmountPerTrade: number;
  percentageOfWallet: number;
  minTokenAge: number;
  maxSlippage: number;
  blacklistedTokens: string[];
  whitelistedTokens: string[];
  stopLoss?: number;
  takeProfit?: number;
  createdAt: Date;
}

export interface CopiedTrade {
  id: string;
  userId: string;
  targetWallet: string;
  tokenAddress: string;
  type: 'buy' | 'sell';
  originalAmount: number;
  copiedAmount: number;
  originalTxHash: string;
  copiedTxHash?: string;
  status: 'pending' | 'completed' | 'failed';
  reason?: string;
  createdAt: Date;
}

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

export interface LiquidityEvent {
  id?: number;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  pair: string;
  provider: string;
  token0Amount: string;
  token1Amount: string;
  liquidity: string;
  type: 'ADD' | 'REMOVE';
}

export interface StakingPosition {
  id: string;
  userId: string;
  walletAddress: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  stakedAmount: number;
  earnedRewards: number;
  startTime: Date;
  unlockTime: Date;
  isActive: boolean;
  lastClaimTime?: Date;
}

export class DatabaseService {
  private pool: Pool;
  private logger = createLogger({ service: 'database' });

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'core_meme_platform',
      user: process.env.POSTGRES_USER || 'core_user',
      password: process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.logger.info('Database connected successfully');
      
      // Create tables if they don't exist
      await this.createTables();
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const queries = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        wallet_address VARCHAR(42) UNIQUE NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        subscription_tier VARCHAR(50) DEFAULT 'free',
        portfolio_value DECIMAL(20, 8) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Wallets table
      `CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(42) NOT NULL,
        type VARCHAR(20) NOT NULL,
        encrypted_private_key TEXT,
        network VARCHAR(20) DEFAULT 'CORE',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, address)
      )`,
      
      // Positions table
      `CREATE TABLE IF NOT EXISTS positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_address VARCHAR(42) NOT NULL,
        token_symbol VARCHAR(20) NOT NULL,
        token_name VARCHAR(255),
        amount DECIMAL(30, 18) NOT NULL,
        avg_buy_price DECIMAL(30, 18) NOT NULL,
        current_price DECIMAL(30, 18),
        initial_investment DECIMAL(20, 8) NOT NULL,
        current_value DECIMAL(20, 8),
        pnl DECIMAL(20, 8),
        pnl_percentage DECIMAL(10, 2),
        first_buy_time TIMESTAMP DEFAULT NOW(),
        last_update_time TIMESTAMP DEFAULT NOW(),
        trades INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(user_id, token_address)
      )`,
      
      // Trading history with P&L tracking
      `CREATE TABLE IF NOT EXISTS trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_address VARCHAR(42) NOT NULL,
        token_address VARCHAR(42) NOT NULL,
        token_symbol VARCHAR(20),
        type VARCHAR(10) NOT NULL,
        amount_core DECIMAL(20, 8) NOT NULL,
        amount_token DECIMAL(30, 18) NOT NULL,
        price DECIMAL(30, 18) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        pnl DECIMAL(20, 8),
        pnl_percentage DECIMAL(10, 2),
        buy_price DECIMAL(30, 18),
        sell_price DECIMAL(30, 18),
        buy_time TIMESTAMP,
        sell_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Copy trade settings
      `CREATE TABLE IF NOT EXISTS copy_trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        target_wallet VARCHAR(42) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        copy_buys BOOLEAN DEFAULT true,
        copy_sells BOOLEAN DEFAULT true,
        max_amount_per_trade DECIMAL(20, 8) DEFAULT 1,
        percentage_of_wallet DECIMAL(5, 2) DEFAULT 25,
        min_token_age INTEGER DEFAULT 1,
        max_slippage DECIMAL(5, 2) DEFAULT 15,
        blacklisted_tokens TEXT[],
        whitelisted_tokens TEXT[],
        stop_loss DECIMAL(5, 2),
        take_profit DECIMAL(5, 2),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, target_wallet)
      )`,
      
      // Copied trades history
      `CREATE TABLE IF NOT EXISTS copied_trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        target_wallet VARCHAR(42) NOT NULL,
        token_address VARCHAR(42) NOT NULL,
        type VARCHAR(10) NOT NULL,
        original_amount DECIMAL(20, 8) NOT NULL,
        copied_amount DECIMAL(20, 8) NOT NULL,
        original_tx_hash VARCHAR(66) NOT NULL,
        copied_tx_hash VARCHAR(66),
        status VARCHAR(20) DEFAULT 'pending',
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Alerts
      `CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        settings JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Subscriptions
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        tier VARCHAR(20) NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'active'
      )`,
      
      // Price alerts table
      `CREATE TABLE IF NOT EXISTS price_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_address VARCHAR(42) NOT NULL,
        token_symbol VARCHAR(20),
        target_price DECIMAL(30, 18) NOT NULL,
        current_price DECIMAL(30, 18),
        alert_type VARCHAR(20) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        triggered_at TIMESTAMP,
        notification_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, token_address, target_price, alert_type)
      )`,
      
      // Tokens table (from blockchain-monitor)
      `CREATE TABLE IF NOT EXISTS tokens (
        address VARCHAR(42) PRIMARY KEY,
        name VARCHAR(255),
        symbol VARCHAR(20),
        decimals INTEGER,
        total_supply VARCHAR(80),
        creator VARCHAR(42),
        created_timestamp BIGINT,
        block_number INTEGER,
        transaction_hash VARCHAR(66),
        is_verified BOOLEAN DEFAULT false,
        description TEXT,
        website VARCHAR(255),
        twitter VARCHAR(255),
        telegram VARCHAR(255),
        image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'CREATED',
        ownership_renounced BOOLEAN DEFAULT false,
        max_wallet VARCHAR(80),
        max_transaction VARCHAR(80),
        trading_enabled BOOLEAN DEFAULT true,
        launch_block INTEGER,
        sold VARCHAR(80),
        raised VARCHAR(80),
        bonding_curve_progress DECIMAL(5, 2),
        current_price VARCHAR(80),
        metadata_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Pairs table
      `CREATE TABLE IF NOT EXISTS pairs (
        address VARCHAR(42) PRIMARY KEY,
        token0 VARCHAR(42),
        token1 VARCHAR(42),
        reserve0 VARCHAR(80),
        reserve1 VARCHAR(80),
        total_supply VARCHAR(80),
        dex VARCHAR(50),
        pair_created_at BIGINT,
        block_number INTEGER,
        transaction_hash VARCHAR(66),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Token analytics table
      `CREATE TABLE IF NOT EXISTS token_analytics (
        address VARCHAR(42) PRIMARY KEY,
        rug_score DECIMAL(5, 2),
        is_honeypot BOOLEAN,
        ownership_concentration DECIMAL(5, 2),
        liquidity_usd DECIMAL(20, 2),
        volume_24h DECIMAL(20, 2),
        holders INTEGER,
        transactions_24h INTEGER,
        price_usd DECIMAL(30, 18),
        price_change_24h DECIMAL(10, 2),
        market_cap_usd DECIMAL(20, 2),
        circulating_supply VARCHAR(80),
        max_wallet_percent DECIMAL(5, 2),
        max_transaction_percent DECIMAL(5, 2),
        buy_tax DECIMAL(5, 2),
        sell_tax DECIMAL(5, 2),
        is_renounced BOOLEAN,
        liquidity_locked BOOLEAN,
        liquidity_lock_expiry BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Liquidity events table
      `CREATE TABLE IF NOT EXISTS liquidity_events (
        id SERIAL PRIMARY KEY,
        transaction_hash VARCHAR(66),
        block_number INTEGER,
        timestamp BIGINT,
        pair VARCHAR(42),
        provider VARCHAR(42),
        token0_amount VARCHAR(80),
        token1_amount VARCHAR(80),
        liquidity VARCHAR(80),
        type VARCHAR(10),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Trader profiles table
      `CREATE TABLE IF NOT EXISTS trader_profiles (
        address VARCHAR(42) PRIMARY KEY,
        total_trades INTEGER,
        total_volume_usd DECIMAL(20, 2),
        profit_loss DECIMAL(20, 2),
        win_rate DECIMAL(5, 2),
        avg_trade_size DECIMAL(20, 2),
        first_trade BIGINT,
        last_trade BIGINT,
        favorite_tokens TEXT[],
        is_whale BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Staking positions table
      `CREATE TABLE IF NOT EXISTS staking_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_address VARCHAR(42) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        staked_amount DECIMAL(20, 8) NOT NULL,
        earned_rewards DECIMAL(20, 8) DEFAULT 0,
        start_time TIMESTAMP DEFAULT NOW(),
        unlock_time TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        last_claim_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Volume tracking tables
      `CREATE TABLE IF NOT EXISTS hourly_volume (
        id SERIAL PRIMARY KEY,
        pair VARCHAR(42),
        token VARCHAR(42),
        hour INTEGER,
        volume DECIMAL(20, 8),
        trade_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(pair, hour)
      )`,
      
      `CREATE TABLE IF NOT EXISTS daily_volume (
        id SERIAL PRIMARY KEY,
        pair VARCHAR(42),
        token VARCHAR(42),
        day INTEGER,
        volume DECIMAL(20, 8),
        trade_count INTEGER,
        high_price DECIMAL(30, 18),
        low_price DECIMAL(30, 18),
        open_price DECIMAL(30, 18),
        close_price DECIMAL(30, 18),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(pair, day)
      )`,
    ];

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tokens_created_timestamp ON tokens(created_timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator)',
      'CREATE INDEX IF NOT EXISTS idx_pairs_token0 ON pairs(token0)',
      'CREATE INDEX IF NOT EXISTS idx_pairs_token1 ON pairs(token1)',
      'CREATE INDEX IF NOT EXISTS idx_pairs_dex ON pairs(dex)',
      'CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address)',
      'CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_positions_token ON positions(token_address)',
      'CREATE INDEX IF NOT EXISTS idx_copy_trades_target ON copy_trades(target_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_price_alerts_token ON price_alerts(token_address)',
      'CREATE INDEX IF NOT EXISTS idx_trader_profiles_volume ON trader_profiles(total_volume_usd)',
      'CREATE INDEX IF NOT EXISTS idx_trader_profiles_whale ON trader_profiles(is_whale)',
      'CREATE INDEX IF NOT EXISTS idx_staking_positions_user ON staking_positions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_staking_positions_wallet ON staking_positions(wallet_address)',
    ];

    // Execute table creation queries
    for (const query of queries) {
      try {
        await this.pool.query(query);
      } catch (error) {
        this.logger.error('Failed to create table:', error);
      }
    }

    // Execute index creation queries
    for (const index of indexes) {
      try {
        await this.pool.query(index);
      } catch (error) {
        this.logger.error('Failed to create index:', error);
      }
    }

    this.logger.info('Database tables initialized successfully');
  }

  // User methods
  async createUser(userData: Partial<User>): Promise<User> {
    const query = `
      INSERT INTO users (telegram_id, username, wallet_address, encrypted_private_key)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      userData.telegramId,
      userData.username,
      userData.walletAddress,
      userData.encryptedPrivateKey,
    ]);
    
    return this.mapToUser(result.rows[0]);
  }

  async getUserById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await this.pool.query(query, [telegramId]);
    
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE wallet_address = $1';
    const result = await this.pool.query(query, [walletAddress.toLowerCase()]);
    
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null;
  }

  async getAllUsers(): Promise<User[]> {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';
    const result = await this.pool.query(query);
    
    return result.rows.map(row => this.mapToUser(row));
  }

  async updateUserEncryptedKey(userId: string, encryptedKey: string): Promise<void> {
    const query = `
      UPDATE users 
      SET encrypted_private_key = $1, updated_at = NOW()
      WHERE id = $2
    `;
    
    await this.pool.query(query, [encryptedKey, userId]);
  }

  async getUserIdByWallet(walletAddress: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT telegram_id FROM users WHERE wallet_address = $1',
      [walletAddress]
    );
    return result.rows[0]?.telegram_id || 0;
  }

  async updateUserSubscription(userId: string, tier: string): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
        [tier, userId]
      );
    } catch (error) {
      this.logger.error('Error updating user subscription:', error);
    }
  }

  // Wallet methods
  async createWallet(walletData: Partial<Wallet>): Promise<Wallet> {
    const query = `
      INSERT INTO wallets (user_id, name, address, type, encrypted_private_key, network)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      walletData.userId,
      walletData.name,
      walletData.address,
      walletData.type,
      walletData.encryptedPrivateKey,
      walletData.network || 'CORE',
    ]);
    
    return this.mapToWallet(result.rows[0]);
  }

  async getWalletByAddress(address: string): Promise<Wallet | null> {
    const query = 'SELECT * FROM wallets WHERE address = $1';
    const result = await this.pool.query(query, [address]);
    
    return result.rows[0] ? this.mapToWallet(result.rows[0]) : null;
  }

  async getTradingWallets(userId: string): Promise<Wallet[]> {
    const query = 'SELECT * FROM wallets WHERE user_id = $1 AND type = $2';
    const result = await this.pool.query(query, [userId, 'trading']);
    
    return result.rows.map(row => this.mapToWallet(row));
  }

  async getWithdrawWallets(userId: string): Promise<Wallet[]> {
    const query = 'SELECT * FROM wallets WHERE user_id = $1 AND type = $2';
    const result = await this.pool.query(query, [userId, 'withdraw']);
    
    return result.rows.map(row => this.mapToWallet(row));
  }

  async getWithdrawWallet(userId: string, address: string): Promise<Wallet | null> {
    const query = 'SELECT * FROM wallets WHERE user_id = $1 AND address = $2 AND type = $3';
    const result = await this.pool.query(query, [userId, address, 'withdraw']);
    
    return result.rows[0] ? this.mapToWallet(result.rows[0]) : null;
  }

  async getUserWallet(userId: string): Promise<Wallet | null> {
    const user = await this.getUserById(userId);
    if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
      return null;
    }
    
    return {
      id: userId,
      userId,
      name: 'Primary',
      address: user.walletAddress,
      type: 'primary',
      encryptedPrivateKey: user.encryptedPrivateKey,
      network: 'CORE',
      createdAt: user.createdAt,
    };
  }

  // Position management methods
  async getUserPositions(userId: string): Promise<Position[]> {
    const query = `
      SELECT * FROM positions 
      WHERE user_id = $1 AND is_active = true 
      ORDER BY current_value DESC
    `;
    const result = await this.pool.query(query, [userId]);
    
    return result.rows.map(row => this.mapToPosition(row));
  }

  async getPosition(userId: string, tokenAddress: string): Promise<Position | null> {
    const query = `
      SELECT * FROM positions 
      WHERE user_id = $1 AND token_address = $2 AND is_active = true
    `;
    const result = await this.pool.query(query, [userId, tokenAddress]);
    
    return result.rows[0] ? this.mapToPosition(result.rows[0]) : null;
  }

  async createPosition(positionData: Partial<Position>): Promise<Position> {
    const query = `
      INSERT INTO positions (
        user_id, token_address, token_symbol, token_name,
        amount, avg_buy_price, current_price, initial_investment,
        current_value, pnl, pnl_percentage, trades
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      positionData.userId,
      positionData.tokenAddress,
      positionData.tokenSymbol,
      positionData.tokenName,
      positionData.amount,
      positionData.avgBuyPrice,
      positionData.currentPrice,
      positionData.initialInvestment,
      positionData.currentValue,
      positionData.pnl || 0,
      positionData.pnlPercentage || 0,
      positionData.trades || 1,
    ]);
    
    return this.mapToPosition(result.rows[0]);
  }

  async updatePosition(positionData: Partial<Position>): Promise<void> {
    const query = `
      UPDATE positions 
      SET 
        amount = COALESCE($3, amount),
        avg_buy_price = COALESCE($4, avg_buy_price),
        current_price = COALESCE($5, current_price),
        current_value = COALESCE($6, current_value),
        pnl = COALESCE($7, pnl),
        pnl_percentage = COALESCE($8, pnl_percentage),
        trades = COALESCE($9, trades),
        last_update_time = NOW()
      WHERE user_id = $1 AND token_address = $2
    `;
    
    await this.pool.query(query, [
      positionData.userId,
      positionData.tokenAddress,
      positionData.amount,
      positionData.avgBuyPrice,
      positionData.currentPrice,
      positionData.currentValue,
      positionData.pnl,
      positionData.pnlPercentage,
      positionData.trades,
    ]);
  }

  async closePosition(userId: string, tokenAddress: string): Promise<void> {
    const query = `
      UPDATE positions 
      SET is_active = false, last_update_time = NOW()
      WHERE user_id = $1 AND token_address = $2
    `;
    
    await this.pool.query(query, [userId, tokenAddress]);
  }

  async getAllActivePositions(): Promise<Position[]> {
    const query = `
      SELECT * FROM positions 
      WHERE is_active = true 
      ORDER BY last_update_time ASC
      LIMIT 100
    `;
    const result = await this.pool.query(query);
    
    return result.rows.map(row => this.mapToPosition(row));
  }

  async updatePositionPrice(positionId: string, price: number): Promise<void> {
    const query = `
      UPDATE positions 
      SET 
        current_price = $2,
        current_value = amount * $2,
        pnl = (amount * $2) - initial_investment,
        pnl_percentage = ((amount * $2 - initial_investment) / initial_investment) * 100,
        last_update_time = NOW()
      WHERE id = $1
    `;
    
    await this.pool.query(query, [positionId, price]);
  }

  // Trade history methods
  async getUserTrades(userId: string, days: number = 30, limit?: number, offset?: number): Promise<Trade[]> {
    let query = `
      SELECT * FROM trades 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `;
    
    const params: any[] = [userId];
    
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $2 OFFSET $3`;
      params.push(limit, offset);
    }
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => this.mapToTrade(row));
  }

  async saveTrade(tradeData: Partial<Trade>): Promise<Trade> {
    const query = `
      INSERT INTO trades (
        user_id, wallet_address, token_address, token_symbol,
        type, amount_core, amount_token, price, tx_hash,
        pnl, pnl_percentage, buy_price, sell_price,
        buy_time, sell_time, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      tradeData.userId,
      tradeData.walletAddress,
      tradeData.tokenAddress,
      tradeData.tokenSymbol,
      tradeData.type,
      tradeData.amountCore,
      tradeData.amountToken,
      tradeData.price,
      tradeData.txHash,
      tradeData.pnl,
      tradeData.pnlPercentage,
      (tradeData as any).buyPrice,
      (tradeData as any).sellPrice,
      (tradeData as any).buyTime,
      (tradeData as any).sellTime,
      tradeData.status || 'completed',
    ]);
    
    return this.mapToTrade(result.rows[0]);
  }

  // Copy trading methods
  async getCopyTradeSettings(userId: string, targetWallet: string): Promise<CopyTradeSettings | null> {
    const query = `
      SELECT * FROM copy_trades 
      WHERE user_id = $1 AND target_wallet = $2
    `;
    const result = await this.pool.query(query, [userId, targetWallet]);
    
    return result.rows[0] ? this.mapToCopyTradeSettings(result.rows[0]) : null;
  }

  async saveCopyTradeSettings(settings: CopyTradeSettings): Promise<void> {
    const query = `
      INSERT INTO copy_trades (
        user_id, target_wallet, enabled, copy_buys, copy_sells,
        max_amount_per_trade, percentage_of_wallet, min_token_age,
        max_slippage, blacklisted_tokens, whitelisted_tokens,
        stop_loss, take_profit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (user_id, target_wallet) 
      DO UPDATE SET
        enabled = $3, copy_buys = $4, copy_sells = $5,
        max_amount_per_trade = $6, percentage_of_wallet = $7,
        min_token_age = $8, max_slippage = $9,
        blacklisted_tokens = $10, whitelisted_tokens = $11,
        stop_loss = $12, take_profit = $13
    `;
    
    await this.pool.query(query, [
      settings.userId,
      settings.targetWallet,
      settings.enabled,
      settings.copyBuys,
      settings.copySells,
      settings.maxAmountPerTrade,
      settings.percentageOfWallet,
      settings.minTokenAge,
      settings.maxSlippage,
      settings.blacklistedTokens,
      settings.whitelistedTokens,
      settings.stopLoss,
      settings.takeProfit,
    ]);
  }

  async updateCopyTradeSettings(userId: string, targetWallet: string, updates: Partial<CopyTradeSettings>): Promise<void> {
    const fields = [];
    const values: any[] = [userId, targetWallet];
    let index = 3;

    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${index++}`);
      values.push(updates.enabled);
    }
    if (updates.copyBuys !== undefined) {
      fields.push(`copy_buys = $${index++}`);
      values.push(updates.copyBuys);
    }
    if (updates.copySells !== undefined) {
      fields.push(`copy_sells = $${index++}`);
      values.push(updates.copySells);
    }

    if (fields.length === 0) return;

    const query = `
      UPDATE copy_trades 
      SET ${fields.join(', ')}
      WHERE user_id = $1 AND target_wallet = $2
    `;
    
    await this.pool.query(query, values);
  }

  async getUserCopyTrades(userId: string): Promise<CopyTradeSettings[]> {
    const query = `
      SELECT * FROM copy_trades 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    
    return result.rows.map(row => this.mapToCopyTradeSettings(row));
  }

  async getCopiedTrades(userId: string, limit: number = 50): Promise<CopiedTrade[]> {
    const query = `
      SELECT * FROM copied_trades 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userId, limit]);
    
    return result.rows.map(row => this.mapToCopiedTrade(row));
  }

  async getWalletCopiers(walletAddress: string): Promise<CopyTradeSettings[]> {
    const query = `
      SELECT * FROM copy_trades 
      WHERE target_wallet = $1 AND enabled = true
    `;
    const result = await this.pool.query(query, [walletAddress]);
    
    return result.rows.map(row => this.mapToCopyTradeSettings(row));
  }

  async getWalletFollowersCount(walletAddress: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM copy_trades 
      WHERE target_wallet = $1 AND enabled = true
    `;
    const result = await this.pool.query(query, [walletAddress]);
    
    return parseInt(result.rows[0].count, 10);
  }

  async saveCopiedTrade(trade: CopiedTrade): Promise<void> {
    const query = `
      INSERT INTO copied_trades (
        id, user_id, target_wallet, token_address, type,
        original_amount, copied_amount, original_tx_hash,
        copied_tx_hash, status, reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await this.pool.query(query, [
      trade.id,
      trade.userId,
      trade.targetWallet,
      trade.tokenAddress,
      trade.type,
      trade.originalAmount,
      trade.copiedAmount,
      trade.originalTxHash,
      trade.copiedTxHash,
      trade.status,
      trade.reason,
    ]);
  }

  async updateCopiedTrade(trade: CopiedTrade): Promise<void> {
    const query = `
      UPDATE copied_trades 
      SET 
        copied_tx_hash = $2,
        status = $3,
        reason = $4
      WHERE id = $1
    `;
    
    await this.pool.query(query, [
      trade.id,
      trade.copiedTxHash,
      trade.status,
      trade.reason,
    ]);
  }

  // Token methods (from blockchain-monitor)
  async saveToken(token: Partial<Token>): Promise<void> {
    const query = `
      INSERT INTO tokens (
        address, name, symbol, decimals, total_supply, creator,
        created_timestamp, block_number, transaction_hash, is_verified,
        description, website, twitter, telegram, image_url, status,
        ownership_renounced, max_wallet, max_transaction, trading_enabled,
        launch_block, sold, raised, bonding_curve_progress, current_price,
        metadata_updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
      ON CONFLICT (address) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        decimals = EXCLUDED.decimals,
        total_supply = EXCLUDED.total_supply,
        is_verified = EXCLUDED.is_verified,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        twitter = EXCLUDED.twitter,
        telegram = EXCLUDED.telegram,
        image_url = EXCLUDED.image_url,
        status = EXCLUDED.status,
        ownership_renounced = EXCLUDED.ownership_renounced,
        max_wallet = EXCLUDED.max_wallet,
        max_transaction = EXCLUDED.max_transaction,
        trading_enabled = EXCLUDED.trading_enabled,
        sold = EXCLUDED.sold,
        raised = EXCLUDED.raised,
        bonding_curve_progress = EXCLUDED.bonding_curve_progress,
        current_price = EXCLUDED.current_price,
        metadata_updated_at = NOW(),
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [
      token.address,
      token.name,
      token.symbol,
      token.decimals,
      token.totalSupply,
      token.creator,
      token.createdAt,
      token.blockNumber,
      token.transactionHash,
      token.isVerified || false,
      token.description || '',
      token.website || null,
      token.twitter || null,
      token.telegram || null,
      (token as any).image_url || null,
      token.status || 'CREATED',
      token.ownershipRenounced || false,
      (token as any).max_wallet || '0',
      (token as any).max_transaction || '0',
      (token as any).trading_enabled !== false,
      (token as any).launch_block || 0,
      (token as any).sold || '0',
      (token as any).raised || '0',
      (token as any).bondingCurveProgress || 0,
      (token as any).currentPrice || '0',
    ]);
  }

  async updateToken(token: Partial<Token>): Promise<void> {
    const fields = [];
    const values: any[] = [];
    let index = 1;

    if (token.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(token.name);
    }
    if (token.symbol !== undefined) {
      fields.push(`symbol = $${index++}`);
      values.push(token.symbol);
    }
    if (token.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(token.description);
    }
    if (token.isVerified !== undefined) {
      fields.push(`is_verified = $${index++}`);
      values.push(token.isVerified);
    }
    if (token.status !== undefined) {
      fields.push(`status = $${index++}`);
      values.push(token.status);
    }
    if (token.ownershipRenounced !== undefined) {
      fields.push(`ownership_renounced = $${index++}`);
      values.push(token.ownershipRenounced);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = NOW()');
    values.push(token.address);

    const query = `UPDATE tokens SET ${fields.join(', ')} WHERE address = $${index}`;
    await this.pool.query(query, values);
  }

  async getToken(address: string): Promise<Token | null> {
    const query = 'SELECT * FROM tokens WHERE address = $1';
    const result = await this.pool.query(query, [address.toLowerCase()]);
    
    return result.rows[0] ? this.mapToToken(result.rows[0]) : null;
  }

  async getTokensByCreator(creatorId: string): Promise<Token[]> {
    const query = 'SELECT * FROM tokens WHERE creator = $1 ORDER BY created_timestamp DESC';
    const result = await this.pool.query(query, [creatorId.toLowerCase()]);
    
    return result.rows.map(row => this.mapToToken(row));
  }

  async updateTokenStatus(address: string, status: string): Promise<void> {
    await this.pool.query(
      'UPDATE tokens SET status = $1, updated_at = NOW() WHERE address = $2',
      [status, address.toLowerCase()]
    );
  }

  async updateTokenOwnership(address: string, renounced: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE tokens SET ownership_renounced = $1, updated_at = NOW() WHERE address = $2',
      [renounced, address.toLowerCase()]
    );
  }

  // Pair methods
  async savePair(pair: Pair): Promise<void> {
    const query = `
      INSERT INTO pairs (
        address, token0, token1, reserve0, reserve1, total_supply,
        dex, pair_created_at, block_number, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (address) DO UPDATE SET
        reserve0 = EXCLUDED.reserve0,
        reserve1 = EXCLUDED.reserve1,
        total_supply = EXCLUDED.total_supply,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [
      pair.address,
      pair.token0,
      pair.token1,
      pair.reserve0,
      pair.reserve1,
      pair.totalSupply,
      pair.dex,
      pair.createdAt,
      pair.blockNumber,
      (pair as any).transactionHash || '',
    ]);
  }

  async updatePairReserves(address: string, reserve0: string, reserve1: string): Promise<void> {
    await this.pool.query(
      'UPDATE pairs SET reserve0 = $1, reserve1 = $2, updated_at = NOW() WHERE address = $3',
      [reserve0, reserve1, address.toLowerCase()]
    );
  }

  // Token analytics methods
  async saveTokenAnalytics(analytics: Partial<TokenAnalytics>): Promise<void> {
    const query = `
      INSERT INTO token_analytics (
        address, rug_score, is_honeypot, ownership_concentration,
        liquidity_usd, volume_24h, holders, transactions_24h,
        price_usd, price_change_24h, market_cap_usd, circulating_supply,
        max_wallet_percent, max_transaction_percent, buy_tax, sell_tax,
        is_renounced, liquidity_locked, liquidity_lock_expiry
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (address) DO UPDATE SET
        rug_score = EXCLUDED.rug_score,
        is_honeypot = EXCLUDED.is_honeypot,
        ownership_concentration = EXCLUDED.ownership_concentration,
        liquidity_usd = EXCLUDED.liquidity_usd,
        volume_24h = EXCLUDED.volume_24h,
        holders = EXCLUDED.holders,
        transactions_24h = EXCLUDED.transactions_24h,
        price_usd = EXCLUDED.price_usd,
        price_change_24h = EXCLUDED.price_change_24h,
        market_cap_usd = EXCLUDED.market_cap_usd,
        circulating_supply = EXCLUDED.circulating_supply,
        max_wallet_percent = EXCLUDED.max_wallet_percent,
        max_transaction_percent = EXCLUDED.max_transaction_percent,
        buy_tax = EXCLUDED.buy_tax,
        sell_tax = EXCLUDED.sell_tax,
        is_renounced = EXCLUDED.is_renounced,
        liquidity_locked = EXCLUDED.liquidity_locked,
        liquidity_lock_expiry = EXCLUDED.liquidity_lock_expiry,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [
      analytics.tokenAddress,
      (analytics as any).rug_score || null,
      (analytics as any).is_honeypot || false,
      (analytics as any).ownership_concentration || null,
      analytics.liquidity || null,
      analytics.volume24h || null,
      analytics.holders || null,
      (analytics as any).transactions_24h || null,
      analytics.price || null,
      analytics.priceChange24h || null,
      analytics.marketCap || null,
      (analytics as any).circulating_supply || null,
      (analytics as any).max_wallet_percent || null,
      (analytics as any).max_transaction_percent || null,
      (analytics as any).buy_tax || null,
      (analytics as any).sell_tax || null,
      (analytics as any).is_renounced || false,
      (analytics as any).liquidity_locked || false,
      (analytics as any).liquidity_lock_expiry || null,
    ]);
  }

  async getTokenAnalytics(address: string): Promise<TokenAnalytics | null> {
    const query = 'SELECT * FROM token_analytics WHERE address = $1';
    const result = await this.pool.query(query, [address.toLowerCase()]);
    
    return result.rows[0] ? this.mapToTokenAnalytics(result.rows[0]) : null;
  }

  // Liquidity events
  async saveLiquidityEvent(event: LiquidityEvent): Promise<void> {
    const query = `
      INSERT INTO liquidity_events (
        transaction_hash, block_number, timestamp, pair, provider,
        token0_amount, token1_amount, liquidity, type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    await this.pool.query(query, [
      event.transactionHash,
      event.blockNumber,
      event.timestamp,
      event.pair,
      event.provider,
      event.token0Amount,
      event.token1Amount,
      event.liquidity,
      event.type,
    ]);
  }

  // Trader profile methods
  async getTraderProfile(address: string): Promise<TraderProfile | null> {
    const query = 'SELECT * FROM trader_profiles WHERE address = $1';
    const result = await this.pool.query(query, [address.toLowerCase()]);
    
    return result.rows[0] ? this.mapToTraderProfile(result.rows[0]) : null;
  }

  async saveTraderProfile(profile: TraderProfile): Promise<void> {
    const query = `
      INSERT INTO trader_profiles (
        address, total_trades, total_volume_usd, profit_loss, win_rate,
        avg_trade_size, first_trade, last_trade, favorite_tokens, is_whale
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (address) DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        total_volume_usd = EXCLUDED.total_volume_usd,
        profit_loss = EXCLUDED.profit_loss,
        win_rate = EXCLUDED.win_rate,
        avg_trade_size = EXCLUDED.avg_trade_size,
        first_trade = EXCLUDED.first_trade,
        last_trade = EXCLUDED.last_trade,
        favorite_tokens = EXCLUDED.favorite_tokens,
        is_whale = EXCLUDED.is_whale,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [
      profile.address,
      profile.totalTrades,
      profile.totalVolumeUSD,
      profile.profitLoss,
      profile.winRate,
      profile.avgTradeSize,
      profile.firstTrade,
      profile.lastTrade,
      profile.favoriteTokens,
      profile.isWhale || false,
    ]);
  }

  async markAsWhale(address: string): Promise<void> {
    await this.pool.query(
      'UPDATE trader_profiles SET is_whale = true, updated_at = NOW() WHERE address = $1',
      [address.toLowerCase()]
    );
  }

  // Alert methods
  async saveAlert(alert: Partial<Alert>): Promise<void> {
    const query = `
      INSERT INTO alerts (user_id, type, enabled, settings)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        settings = EXCLUDED.settings
    `;
    
    await this.pool.query(query, [
      alert.userId,
      alert.type,
      (alert as any).enabled !== false,
      JSON.stringify(alert.condition || {}),
    ]);
  }

  async getUnsentAlerts(): Promise<Alert[]> {
    // This method is specific to blockchain-monitor alerts
    // We'll need to handle this differently based on the alert structure
    return [];
  }

  async markAlertSent(id: string): Promise<void> {
    // This method is specific to blockchain-monitor alerts
    // We'll need to handle this differently based on the alert structure
  }

  async markAlertTriggered(alertId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE price_alerts 
         SET triggered_at = NOW(), 
             notification_sent = true,
             is_active = false
         WHERE id = $1`,
        [alertId]
      );
      this.logger.debug(`Alert ${alertId} marked as triggered`);
    } catch (error) {
      this.logger.error('Error marking alert as triggered:', error);
    }
  }

  async createPriceAlert(userId: string, tokenAddress: string, tokenSymbol: string, targetPrice: number, alertType: 'above' | 'below'): Promise<boolean> {
    try {
      // Check subscription limits
      const user = await this.getUserById(userId);
      const alertCount = await this.getUserAlertCount(userId);
      
      const limits = {
        free: 5,
        premium: 50,
        pro: -1 // unlimited
      };
      
      const userLimit = limits[user?.subscriptionTier as keyof typeof limits] || limits.free;
      
      if (userLimit !== -1 && alertCount >= userLimit) {
        return false; // Limit reached
      }
      
      await this.pool.query(
        `INSERT INTO price_alerts (user_id, token_address, token_symbol, target_price, alert_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, token_address, target_price, alert_type) DO NOTHING`,
        [userId, tokenAddress.toLowerCase(), tokenSymbol, targetPrice, alertType]
      );
      
      return true;
    } catch (error) {
      this.logger.error('Error creating price alert:', error);
      return false;
    }
  }

  async getUserAlerts(userId: string, active: boolean = true): Promise<any[]> {
    try {
      const query = active
        ? 'SELECT * FROM price_alerts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC'
        : 'SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50';
      
      const result = await this.pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      this.logger.error('Error getting user alerts:', error);
      return [];
    }
  }

  async getUserAlertCount(userId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        'SELECT COUNT(*) FROM price_alerts WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      this.logger.error('Error getting alert count:', error);
      return 0;
    }
  }

  async deletePriceAlert(userId: string, alertId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM price_alerts WHERE id = $1 AND user_id = $2',
        [alertId, userId]
      );
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error) {
      this.logger.error('Error deleting price alert:', error);
      return false;
    }
  }

  async checkPriceAlerts(tokenAddress: string, currentPrice: number): Promise<any[]> {
    try {
      const query = `
        SELECT 
          pa.*,
          u.telegram_id,
          u.username
        FROM price_alerts pa
        JOIN users u ON pa.user_id = u.id
        WHERE pa.token_address = $1 
          AND pa.is_active = true
          AND pa.notification_sent = false
          AND (
            (pa.alert_type = 'above' AND $2 >= pa.target_price) OR
            (pa.alert_type = 'below' AND $2 <= pa.target_price)
          )
      `;
      
      const result = await this.pool.query(query, [tokenAddress.toLowerCase(), currentPrice]);
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.telegram_id,
        username: row.username,
        tokenAddress: row.token_address,
        tokenSymbol: row.token_symbol,
        targetPrice: parseFloat(row.target_price),
        currentPrice: currentPrice,
        alertType: row.alert_type,
        createdAt: row.created_at
      }));
    } catch (error) {
      this.logger.error('Error checking price alerts:', error);
      return [];
    }
  }

  async updateTokenPrice(tokenAddress: string, price: number): Promise<void> {
    await this.pool.query(
      'UPDATE positions SET current_price = $1, last_update_time = NOW() WHERE token_address = $2',
      [price, tokenAddress]
    );
  }

  // Alert settings methods
  async getUserAlertSettings(userId: string): Promise<any> {
    try {
      const result = await this.pool.query(
        'SELECT settings FROM alerts WHERE user_id = $1 AND type = $2',
        [userId, 'global_settings']
      );
      return result.rows[0]?.settings || {
        new_tokens: false,
        large_trades: false,
        whale_activity: false,
        price_changes: true,
        liquidity_changes: false,
        rug_warnings: true
      };
    } catch (error) {
      this.logger.error('Error getting alert settings:', error);
      return {};
    }
  }

  async updateAlertSettings(userId: string, alertType: string, enabled: boolean): Promise<void> {
    try {
      // Get current settings
      const currentSettings = await this.getUserAlertSettings(userId);
      currentSettings[alertType] = enabled;
      
      // Update or insert settings
      await this.pool.query(
        `INSERT INTO alerts (user_id, type, settings, enabled)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id, type) 
         DO UPDATE SET settings = $3`,
        [userId, 'global_settings', JSON.stringify(currentSettings)]
      );
    } catch (error) {
      this.logger.error('Error updating alert settings:', error);
    }
  }

  // Subscription methods
  async getUserSubscription(userId: string): Promise<any> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2 ORDER BY started_at DESC LIMIT 1',
        [userId, 'active']
      );
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting user subscription:', error);
      return null;
    }
  }

  async createSubscription(data: any): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO subscriptions (user_id, tier, payment_method, status, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [data.user_id, data.tier, data.payment_method, data.status, data.expires_at]
      );
      return true;
    } catch (error) {
      this.logger.error('Error creating subscription:', error);
      return false;
    }
  }

  async cancelSubscription(userId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE subscriptions 
         SET status = 'cancelled' 
         WHERE user_id = $1 AND status = 'active'`,
        [userId]
      );
      
      // Downgrade user to free tier
      await this.pool.query(
        'UPDATE users SET subscription_tier = $1 WHERE id = $2',
        ['free', userId]
      );
    } catch (error) {
      this.logger.error('Error cancelling subscription:', error);
    }
  }

  // Staking methods
  async createStakingPosition(stakingData: Partial<StakingPosition>): Promise<StakingPosition> {
    const query = `
      INSERT INTO staking_positions (
        user_id, wallet_address, tier, staked_amount, earned_rewards,
        start_time, unlock_time, is_active, last_claim_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      stakingData.userId,
      stakingData.walletAddress,
      stakingData.tier,
      stakingData.stakedAmount,
      stakingData.earnedRewards || 0,
      stakingData.startTime || new Date(),
      stakingData.unlockTime,
      stakingData.isActive !== false,
      stakingData.lastClaimTime || null,
    ]);
    
    return this.mapToStakingPosition(result.rows[0]);
  }

  async getUserStakingPositions(userId: string): Promise<StakingPosition[]> {
    const query = 'SELECT * FROM staking_positions WHERE user_id = $1 ORDER BY start_time DESC';
    const result = await this.pool.query(query, [userId]);
    
    return result.rows.map(row => this.mapToStakingPosition(row));
  }

  async getActiveStakingPosition(walletAddress: string): Promise<StakingPosition | null> {
    const query = 'SELECT * FROM staking_positions WHERE wallet_address = $1 AND is_active = true';
    const result = await this.pool.query(query, [walletAddress]);
    
    return result.rows[0] ? this.mapToStakingPosition(result.rows[0]) : null;
  }

  async updateStakingRewards(positionId: string, earnedRewards: number): Promise<void> {
    await this.pool.query(
      'UPDATE staking_positions SET earned_rewards = $1, last_claim_time = NOW(), updated_at = NOW() WHERE id = $2',
      [earnedRewards, positionId]
    );
  }

  async closeStakingPosition(positionId: string): Promise<void> {
    await this.pool.query(
      'UPDATE staking_positions SET is_active = false, updated_at = NOW() WHERE id = $1',
      [positionId]
    );
  }

  // Volume tracking methods
  async updateHourlyVolume(pair: string, hour: number, volume: number, tradeCount: number = 1): Promise<void> {
    const query = `
      INSERT INTO hourly_volume (pair, hour, volume, trade_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (pair, hour) DO UPDATE SET
        volume = hourly_volume.volume + EXCLUDED.volume,
        trade_count = hourly_volume.trade_count + EXCLUDED.trade_count,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [pair.toLowerCase(), hour, volume, tradeCount]);
  }

  async updateDailyVolume(pair: string, day: number, volume: number, tradeCount: number = 1): Promise<void> {
    const query = `
      INSERT INTO daily_volume (pair, day, volume, trade_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (pair, day) DO UPDATE SET
        volume = daily_volume.volume + EXCLUDED.volume,
        trade_count = daily_volume.trade_count + EXCLUDED.trade_count,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [pair.toLowerCase(), day, volume, tradeCount]);
  }

  async updateTokenHourlyVolume(token: string, hour: number, volume: number, tradeCount: number = 1): Promise<void> {
    const query = `
      INSERT INTO hourly_volume (token, hour, volume, trade_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (token, hour) DO UPDATE SET
        volume = hourly_volume.volume + EXCLUDED.volume,
        trade_count = hourly_volume.trade_count + EXCLUDED.trade_count,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [token.toLowerCase(), hour, volume, tradeCount]);
  }

  async updateTokenDailyVolume(token: string, day: number, volume: number, tradeCount: number = 1): Promise<void> {
    const query = `
      INSERT INTO daily_volume (token, day, volume, trade_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (token, day) DO UPDATE SET
        volume = daily_volume.volume + EXCLUDED.volume,
        trade_count = daily_volume.trade_count + EXCLUDED.trade_count,
        updated_at = NOW()
    `;
    
    await this.pool.query(query, [token.toLowerCase(), day, volume, tradeCount]);
  }

  async incrementTokenVolume(token: string, trade: any): Promise<void> {
    const hour = Math.floor(trade.timestamp / 3600000);
    const day = Math.floor(trade.timestamp / 86400000);
    
    const volume = trade.tokenIn === token ? 
      parseFloat(trade.amountIn) : 
      parseFloat(trade.amountOut);
    
    await this.updateTokenHourlyVolume(token, hour, volume);
    await this.updateTokenDailyVolume(token, day, volume);
  }

  async incrementTokenTransactions(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE token_analytics 
       SET transactions_24h = COALESCE(transactions_24h, 0) + 1, updated_at = NOW()
       WHERE address = $1`,
      [token.toLowerCase()]
    );
  }

  // Token events
  async saveTokenLaunch(data: any): Promise<void> {
    await this.pool.query(
      'UPDATE tokens SET status = $1, updated_at = NOW() WHERE address = $2',
      ['LAUNCHED', data.token.toLowerCase()]
    );
  }

  async saveTokenEvent(event: any): Promise<void> {
    // Could create a separate events table if needed
    this.logger.info('Token event saved:', event);
  }

  // Additional helper methods for specific queries
  async getAlertSubscribers(_alertType: string): Promise<number[]> {
    const result = await this.pool.query(
      'SELECT telegram_id FROM users WHERE subscription_tier IN ($1, $2) AND telegram_id IS NOT NULL',
      ['premium', 'pro']
    );
    return result.rows.map(row => row.telegram_id);
  }

  async getNewTokenSubscribers(): Promise<number[]> {
    const result = await this.pool.query(
      'SELECT telegram_id FROM users WHERE subscription_tier IN ($1, $2) AND telegram_id IS NOT NULL',
      ['premium', 'pro']
    );
    return result.rows.map(row => row.telegram_id);
  }

  async getWhaleAlertSubscribers(): Promise<number[]> {
    const result = await this.pool.query(
      'SELECT telegram_id FROM users WHERE subscription_tier = $1 AND telegram_id IS NOT NULL',
      ['pro']
    );
    return result.rows.map(row => row.telegram_id);
  }

  async getSubscriptionTierDistribution(): Promise<Record<string, number>> {
    const distribution: Record<string, number> = {
      free: 0,
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0
    };
    
    try {
      const result = await this.pool.query(
        'SELECT subscription_tier, COUNT(*) as count FROM users GROUP BY subscription_tier'
      );
      
      for (const row of result.rows) {
        const tier = row.subscription_tier?.toLowerCase() || 'free';
        if (tier in distribution) {
          distribution[tier] = parseInt(row.count);
        }
      }
      
      return distribution;
    } catch (error) {
      this.logger.error('Error getting subscription tier distribution:', error);
      return distribution;
    }
  }

  async getTopStakers(limit: number): Promise<Array<{
    wallet_address: string;
    username: string;
    staked_amount: number;
    total_earned: number;
  }>> {
    try {
      const query = `
        SELECT 
          sp.wallet_address,
          u.username,
          sp.staked_amount,
          sp.earned_rewards as total_earned
        FROM staking_positions sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.is_active = true
        ORDER BY sp.staked_amount DESC
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [limit]);
      
      return result.rows.map(row => ({
        wallet_address: row.wallet_address,
        username: row.username || 'Anonymous',
        staked_amount: parseFloat(row.staked_amount),
        total_earned: parseFloat(row.total_earned)
      }));
    } catch (error) {
      this.logger.error('Error getting top stakers:', error);
      return [];
    }
  }

  async getRecentTrades(tokenAddress: string, limit: number = 100): Promise<Trade[]> {
    const query = `
      SELECT * FROM trades 
      WHERE token_address = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [tokenAddress.toLowerCase(), limit]);
    
    return result.rows.map(row => this.mapToTrade(row));
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    return this.getUserByWalletAddress(walletAddress);
  }

  // Helper methods to map database rows to types
  private mapToUser(row: any): User {
    return {
      id: row.id,
      telegramId: row.telegram_id,
      username: row.username,
      walletAddress: row.wallet_address,
      encryptedPrivateKey: row.encrypted_private_key,
      subscriptionTier: row.subscription_tier,
      portfolioValue: parseFloat(row.portfolio_value || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToWallet(row: any): Wallet {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      address: row.address,
      type: row.type,
      encryptedPrivateKey: row.encrypted_private_key,
      network: row.network,
      createdAt: row.created_at,
    };
  }

  private mapToPosition(row: any): Position {
    return {
      id: row.id,
      userId: row.user_id,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol,
      tokenName: row.token_name,
      amount: parseFloat(row.amount),
      avgBuyPrice: parseFloat(row.avg_buy_price),
      currentPrice: parseFloat(row.current_price || 0),
      initialInvestment: parseFloat(row.initial_investment),
      currentValue: parseFloat(row.current_value || 0),
      pnl: parseFloat(row.pnl || 0),
      pnlPercentage: parseFloat(row.pnl_percentage || 0),
      firstBuyTime: row.first_buy_time,
      lastUpdateTime: row.last_update_time,
      trades: row.trades,
      isActive: row.is_active,
    };
  }

  private mapToTrade(row: any): Trade {
    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol,
      type: row.type,
      amountCore: parseFloat(row.amount_core),
      amountToken: parseFloat(row.amount_token),
      price: parseFloat(row.price),
      txHash: row.tx_hash,
      pnl: row.pnl ? parseFloat(row.pnl) : undefined,
      pnlPercentage: row.pnl_percentage ? parseFloat(row.pnl_percentage) : undefined,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private mapToCopyTradeSettings(row: any): CopyTradeSettings {
    return {
      id: row.id,
      userId: row.user_id,
      targetWallet: row.target_wallet,
      enabled: row.enabled,
      copyBuys: row.copy_buys,
      copySells: row.copy_sells,
      maxAmountPerTrade: parseFloat(row.max_amount_per_trade),
      percentageOfWallet: parseFloat(row.percentage_of_wallet),
      minTokenAge: row.min_token_age,
      maxSlippage: parseFloat(row.max_slippage),
      blacklistedTokens: row.blacklisted_tokens || [],
      whitelistedTokens: row.whitelisted_tokens || [],
      stopLoss: row.stop_loss ? parseFloat(row.stop_loss) : undefined,
      takeProfit: row.take_profit ? parseFloat(row.take_profit) : undefined,
      createdAt: row.created_at,
    };
  }

  private mapToCopiedTrade(row: any): CopiedTrade {
    return {
      id: row.id,
      userId: row.user_id,
      targetWallet: row.target_wallet,
      tokenAddress: row.token_address,
      type: row.type,
      originalAmount: parseFloat(row.original_amount),
      copiedAmount: parseFloat(row.copied_amount),
      originalTxHash: row.original_tx_hash,
      copiedTxHash: row.copied_tx_hash,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }

  private mapToToken(row: any): Token {
    return {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals,
      totalSupply: row.total_supply,
      creator: row.creator,
      createdAt: row.created_timestamp,
      blockNumber: row.block_number,
      transactionHash: row.transaction_hash,
      isVerified: row.is_verified,
      description: row.description,
      website: row.website,
      twitter: row.twitter,
      telegram: row.telegram,
      status: row.status,
      ownershipRenounced: row.ownership_renounced,
    };
  }

  private mapToTokenAnalytics(row: any): TokenAnalytics {
    return {
      tokenAddress: row.address,
      price: parseFloat(row.price_usd || 0),
      priceChange24h: parseFloat(row.price_change_24h || 0),
      volume24h: parseFloat(row.volume_24h || 0),
      liquidity: parseFloat(row.liquidity_usd || 0),
      marketCap: parseFloat(row.market_cap_usd || 0),
      holders: row.holders || 0,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    };
  }

  private mapToTraderProfile(row: any): TraderProfile {
    return {
      address: row.address,
      totalTrades: row.total_trades,
      totalVolumeUSD: parseFloat(row.total_volume_usd),
      profitLoss: parseFloat(row.profit_loss),
      winRate: parseFloat(row.win_rate),
      avgTradeSize: parseFloat(row.avg_trade_size),
      firstTrade: row.first_trade,
      lastTrade: row.last_trade,
      favoriteTokens: row.favorite_tokens || [],
      isWhale: row.is_whale,
    };
  }

  private mapToStakingPosition(row: any): StakingPosition {
    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      tier: row.tier,
      stakedAmount: parseFloat(row.staked_amount),
      earnedRewards: parseFloat(row.earned_rewards || 0),
      startTime: row.start_time,
      unlockTime: row.unlock_time,
      isActive: row.is_active,
      lastClaimTime: row.last_claim_time,
    };
  }

  // Cleanup
  async close(): Promise<void> {
    await this.pool.end();
  }
}