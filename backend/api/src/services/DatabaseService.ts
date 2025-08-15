import { createLogger } from '@core-meme/shared';

interface User {
  id: string;
  telegramId: number;
  username?: string;
  walletAddress?: string;
  encryptedPrivateKey?: string;
  subscriptionTier?: string;
  createdAt: Date;
}

interface Wallet {
  userId: string;
  address: string;
  encryptedPrivateKey: string;
}

interface Trade {
  userId: string;
  tokenAddress: string;
  type: 'buy' | 'sell';
  amountCore: string;
  amountToken: string;
  price: number;
  txHash: string;
  status: string;
  timestamp: number;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  creatorId: string;
  creatorAddress: string;
  txHash: string;
  timestamp: number;
}

export class DatabaseService {
  private logger = createLogger({ service: 'database' });
  
  // In production, use actual database (PostgreSQL, MongoDB, etc.)
  // This is a simplified in-memory implementation for development
  private users: Map<string, User> = new Map();
  private wallets: Map<string, Wallet> = new Map();
  private trades: Trade[] = [];
  private tokens: Token[] = [];

  async getUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.telegramId === telegramId) {
        return user;
      }
    }
    return null;
  }

  async createUser(data: {
    telegramId: number;
    username?: string;
    firstName: string;
    lastName?: string;
  }): Promise<User> {
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      telegramId: data.telegramId,
      username: data.username,
      createdAt: new Date()
    };
    
    this.users.set(user.id, user);
    this.logger.info('User created', { userId: user.id, telegramId: data.telegramId });
    
    return user;
  }

  async createWallet(data: Wallet): Promise<void> {
    this.wallets.set(data.userId, data);
    
    // Update user with wallet address
    const user = this.users.get(data.userId);
    if (user) {
      user.walletAddress = data.address;
      user.encryptedPrivateKey = data.encryptedPrivateKey;
      this.users.set(data.userId, user);
    }
    
    this.logger.info('Wallet created', { userId: data.userId, address: data.address });
  }

  async getUserWallet(userId: string): Promise<Wallet | null> {
    const user = this.users.get(userId);
    if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
      return null;
    }
    
    return {
      userId,
      address: user.walletAddress,
      encryptedPrivateKey: user.encryptedPrivateKey
    };
  }

  async saveTrade(trade: Trade): Promise<void> {
    this.trades.push(trade);
    this.logger.info('Trade saved', { 
      userId: trade.userId, 
      type: trade.type, 
      txHash: trade.txHash 
    });
  }

  async getUserTrades(userId: string, limit: number, offset: number): Promise<Trade[]> {
    const userTrades = this.trades.filter(t => t.userId === userId);
    return userTrades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit);
  }

  async saveToken(token: Token): Promise<void> {
    this.tokens.push(token);
    this.logger.info('Token saved', { 
      address: token.address, 
      name: token.name, 
      symbol: token.symbol 
    });
  }

  async getTokensByCreator(creatorId: string): Promise<Token[]> {
    return this.tokens.filter(t => t.creatorId === creatorId);
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) {
        return user;
      }
    }
    return null;
  }
  
  async updateUserSubscription(userId: string, tier: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }
    
    user.subscriptionTier = tier;
    this.users.set(userId, user);
    this.logger.info('User subscription updated', { userId, tier });
    
    return true;
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
      // Count users by subscription tier
      for (const user of this.users.values()) {
        // Default to 'free' if no subscription tier is set
        const tier = user.subscriptionTier?.toLowerCase() || 'free';
        
        if (tier in distribution) {
          distribution[tier] += 1;
        } else {
          distribution.free += 1;
        }
      }
      
      return distribution;
    } catch (error) {
      this.logger.error('Error getting subscription tier distribution:', error);
      // Return empty distribution on error
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
      // In a real implementation, this would query the staking_positions table
      // Since this is in-memory, we'll create data based on users
      const stakers = Array.from(this.users.values())
        .filter(user => user.walletAddress) // Only users with wallets
        .map(user => {
          // Generate a realistic staking amount based on user ID
          const hash = this.hashCode(user.id);
          const stakedAmount = Math.abs(hash % 100000) + 1000;
          const totalEarned = stakedAmount * 0.05; // 5% earnings
          
          return {
            wallet_address: user.walletAddress || '',
            username: user.username || 'Anonymous',
            staked_amount: stakedAmount,
            total_earned: totalEarned
          };
        })
        .sort((a, b) => b.staked_amount - a.staked_amount)
        .slice(0, limit);
      
      return stakers;
    } catch (error) {
      this.logger.error('Error getting top stakers:', error);
      // Return empty array on error
      return [];
    }
  }
  
  // Helper function to generate a hash code from a string
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}