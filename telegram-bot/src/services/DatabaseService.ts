import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface User {
  id: string;
  telegramId: number;
  username: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  subscriptionTier?: string;
  portfolioValue?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  name: string;
  address: string;
  type: 'primary' | 'trading' | 'withdraw';
  encryptedPrivateKey?: string;
  network: string;
  createdAt: Date;
}

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

export interface Trade {
  id: string;
  userId: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol?: string;
  type: 'buy' | 'sell';
  amountCore: number;
  amountToken: number;
  price: number;
  txHash: string;
  pnl?: number;
  pnlPercentage?: number;
  buyPrice?: number;
  sellPrice?: number;
  buyTime?: Date;
  sellTime?: Date;
  status: string;
  createdAt: Date;
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

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async initialize() {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      logger.info('Database connected successfully');
      
      // Create tables if they don't exist
      await this.createTables();
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables() {
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
        alert_type VARCHAR(20) NOT NULL, -- 'above' or 'below'
        is_active BOOLEAN DEFAULT true,
        triggered_at TIMESTAMP,
        notification_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, token_address, target_price, alert_type)
      )`,
    ];

    for (const query of queries) {
      try {
        await this.pool.query(query);
      } catch (error) {
        logger.error('Failed to create table:', error);
      }
    }
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
  async getUserTrades(userId: string, days: number = 30): Promise<Trade[]> {
    const query = `
      SELECT * FROM trades 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    
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
      tradeData.buyPrice,
      tradeData.sellPrice,
      tradeData.buyTime,
      tradeData.sellTime,
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

  // Helper methods
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
      buyPrice: row.buy_price ? parseFloat(row.buy_price) : undefined,
      sellPrice: row.sell_price ? parseFloat(row.sell_price) : undefined,
      buyTime: row.buy_time,
      sellTime: row.sell_time,
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

  // Additional methods needed by WalletManager and TradingEngine
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

  // Alert-related methods
  async getAlertSubscribers(alertType: string): Promise<number[]> {
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

  async updateTokenPrice(tokenAddress: string, price: number): Promise<void> {
    await this.pool.query(
      'UPDATE positions SET current_price = $1, last_update_time = NOW() WHERE token_address = $2',
      [price, tokenAddress]
    );
  }

  async checkPriceAlerts(tokenAddress: string, currentPrice: number): Promise<any[]> {
    try {
      // Query active price alerts for this token
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
      logger.error('Error checking price alerts:', error);
      return [];
    }
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
      logger.debug(`Alert ${alertId} marked as triggered`);
    } catch (error) {
      logger.error('Error marking alert as triggered:', error);
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
      logger.error('Error creating price alert:', error);
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
      logger.error('Error getting user alerts:', error);
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
      logger.error('Error getting alert count:', error);
      return 0;
    }
  }

  async deletePriceAlert(userId: string, alertId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM price_alerts WHERE id = $1 AND user_id = $2',
        [alertId, userId]
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting price alert:', error);
      return false;
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
      logger.error('Error getting user subscription:', error);
      return null;
    }
  }

  async updateUserSubscription(userId: string, tier: string): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
        [tier, userId]
      );
    } catch (error) {
      logger.error('Error updating user subscription:', error);
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
      logger.error('Error creating subscription:', error);
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
      logger.error('Error cancelling subscription:', error);
    }
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
      logger.error('Error getting alert settings:', error);
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
      logger.error('Error updating alert settings:', error);
    }
  }

  async close() {
    await this.pool.end();
  }
}