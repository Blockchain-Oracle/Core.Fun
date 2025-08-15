import { ethers } from 'ethers';
import winston from 'winston';
import { Token, TokenAnalytics, Alert } from '../types';
import { DatabaseService } from '@core-meme/shared';
import { AnalyticsService } from '../services/AnalyticsService';
import { AlertService } from '../services/AlertService';
import { createClient, RedisClientType } from 'redis';

export class TokenProcessor {
  private logger: winston.Logger;
  private provider: ethers.JsonRpcProvider;
  private db: DatabaseService;
  private analytics: AnalyticsService;
  private alertService: AlertService;
  private redis: RedisClientType;

  constructor(
    provider: ethers.JsonRpcProvider,
    db: DatabaseService,
    analytics: AnalyticsService,
    alertService: AlertService
  ) {
    this.provider = provider;
    this.db = db;
    this.analytics = analytics;
    this.alertService = alertService;
    
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
          filename: 'token-processor.log' 
        }),
      ],
    });
    
    // Initialize Redis
    this.redis = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });
    
    this.redis.connect().catch(err => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async processNewToken(token: Token): Promise<void> {
    try {
      this.logger.info(`Processing new token: ${token.symbol} (${token.address})`);
      
      // Store token in database
      await this.db.saveToken(token);
      
      // Get additional token information
      const tokenInfo = await this.getTokenInfo(token.address);
      if (tokenInfo) {
        token = { ...token, ...tokenInfo };
        await this.db.updateToken(token);
      }
      
      // Perform initial analysis
      const analytics = await this.analytics.analyzeToken(token.address);
      await this.db.saveTokenAnalytics(analytics);
      
      // Check for red flags
      await this.checkTokenSafety(token, analytics);
      
      // Cache token data
      await this.cacheTokenData(token, analytics);
      
      // Send new token alert
      await this.alertService.sendAlert({
        id: `new-token-${token.address}`,
        type: 'NEW_TOKEN',
        severity: 'LOW',
        tokenAddress: token.address,
        message: `New token created: ${token.name} (${token.symbol})`,
        data: {
          name: token.name,
          symbol: token.symbol,
          creator: token.creator,
          description: token.description,
        },
        timestamp: Date.now(),
      });
      
      // Publish to WebSocket
      await this.publishTokenEvent('NEW_TOKEN', token);
      
    } catch (error) {
      this.logger.error(`Error processing new token ${token.address}:`, error);
      throw error;
    }
  }

  async processTokenLaunch(data: {
    token: string;
    liquidityAdded: string;
    timestamp: number;
    blockNumber: number;
    transactionHash: string;
  }): Promise<void> {
    try {
      this.logger.info(`Processing token launch: ${data.token}`);
      
      // Update token status
      await this.db.updateTokenStatus(data.token, 'LAUNCHED');
      
      // Store launch data
      await this.db.saveTokenLaunch(data);
      
      // Update analytics
      const analytics = await this.analytics.analyzeToken(data.token);
      await this.db.saveTokenAnalytics(analytics);
      
      // Send launch alert
      const token = await this.db.getToken(data.token);
      if (token) {
        await this.alertService.sendAlert({
          id: `token-launch-${data.token}`,
          type: 'NEW_PAIR',
          severity: 'MEDIUM',
          tokenAddress: data.token,
          message: `Token launched: ${token.name} with ${ethers.formatEther(data.liquidityAdded)} CORE liquidity`,
          data: {
            name: token.name,
            symbol: token.symbol,
            liquidityAdded: data.liquidityAdded,
            transactionHash: data.transactionHash,
          },
          timestamp: Date.now(),
        });
      }
      
      // Publish to WebSocket
      await this.publishTokenEvent('TOKEN_LAUNCHED', { tokenAddress: data.token, ...data });
      
    } catch (error) {
      this.logger.error(`Error processing token launch ${data.token}:`, error);
      throw error;
    }
  }

  async processTradingEnabled(data: {
    token: string;
    timestamp: number;
    blockNumber: number;
    transactionHash: string;
  }): Promise<void> {
    try {
      this.logger.info(`Processing trading enabled: ${data.token}`);
      
      // Update token status
      await this.db.updateTokenStatus(data.token, 'TRADING_ENABLED');
      
      // Store event
      await this.db.saveTokenEvent({
        tokenAddress: data.token,
        event: 'TRADING_ENABLED',
        ...data,
      });
      
      // Update analytics
      const analytics = await this.analytics.analyzeToken(data.token);
      await this.db.saveTokenAnalytics(analytics);
      
      // Publish to WebSocket
      await this.publishTokenEvent('TRADING_ENABLED', data);
      
    } catch (error) {
      this.logger.error(`Error processing trading enabled ${data.token}:`, error);
      throw error;
    }
  }

  async processOwnershipRenounced(data: {
    token: string;
    timestamp: number;
    blockNumber: number;
    transactionHash: string;
  }): Promise<void> {
    try {
      this.logger.info(`Processing ownership renounced: ${data.token}`);
      
      // Update token status
      await this.db.updateTokenOwnership(data.token, true);
      
      // Store event
      await this.db.saveTokenEvent({
        tokenAddress: data.token,
        event: 'OWNERSHIP_RENOUNCED',
        ...data,
      });
      
      // Update analytics - ownership renounced improves safety score
      const analytics = await this.analytics.analyzeToken(data.token);
      analytics.isRenounced = true;
      analytics.rugScore = Math.max(0, analytics.rugScore - 20); // Improve rug score
      await this.db.saveTokenAnalytics(analytics);
      
      // Send alert
      const token = await this.db.getToken(data.token);
      if (token) {
        await this.alertService.sendAlert({
          id: `ownership-renounced-${data.token}`,
          type: 'LIQUIDITY_ADDED', // Using as positive event
          severity: 'LOW',
          tokenAddress: data.token,
          message: `Ownership renounced for ${token.name} - Safer investment`,
          data: {
            name: token.name,
            symbol: token.symbol,
            transactionHash: data.transactionHash,
          },
          timestamp: Date.now(),
        });
      }
      
      // Publish to WebSocket
      await this.publishTokenEvent('OWNERSHIP_RENOUNCED', data);
      
    } catch (error) {
      this.logger.error(`Error processing ownership renounced ${data.token}:`, error);
      throw error;
    }
  }

  private async getTokenInfo(address: string): Promise<Partial<Token> | null> {
    try {
      // COMPLETE ABI - ALL FIELDS MUST BE FETCHED
      const abi = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function owner() view returns (address)',
        // CRITICAL METADATA FIELDS - MUST NOT BE SKIPPED
        'function image() view returns (string)',
        'function description() view returns (string)',
        'function twitter() view returns (string)',
        'function telegram() view returns (string)',
        'function website() view returns (string)',
        // TRADING CONTROL FIELDS
        'function maxWallet() view returns (uint256)',
        'function maxTransaction() view returns (uint256)',
        'function tradingEnabled() view returns (bool)',
        'function launchBlock() view returns (uint256)',
      ];
      
      const contract = new ethers.Contract(address, abi, this.provider);
      
      // FETCH ALL FIELDS - NO EXCEPTIONS
      const [
        name, 
        symbol, 
        decimals, 
        totalSupply, 
        owner,
        image, 
        description, 
        twitter, 
        telegram, 
        website,
        maxWallet,
        maxTransaction,
        tradingEnabled,
        launchBlock
      ] = await Promise.all([
        contract.name().catch(() => ''),
        contract.symbol().catch(() => ''),
        contract.decimals().catch(() => 18),
        contract.totalSupply().catch(() => '0'),
        contract.owner().catch(() => ethers.ZeroAddress),
        // METADATA - CRITICAL
        contract.image().catch(() => ''),
        contract.description().catch(() => ''),
        contract.twitter().catch(() => ''),
        contract.telegram().catch(() => ''),
        contract.website().catch(() => ''),
        // TRADING CONTROLS
        contract.maxWallet().catch(() => '0'),
        contract.maxTransaction().catch(() => '0'),
        contract.tradingEnabled().catch(() => false),
        contract.launchBlock().catch(() => 0),
      ]);
      
      const tokenInfo: any = {
        name,
        symbol,
        decimals,
        totalSupply: totalSupply.toString(),
        ownershipRenounced: owner === ethers.ZeroAddress,
      };
      
      // ADD ALL METADATA FIELDS - MANDATORY
      tokenInfo.image_url = image || '';
      tokenInfo.description = description || '';
      tokenInfo.twitter = twitter || '';
      tokenInfo.telegram = telegram || '';
      tokenInfo.website = website || '';
      
      // ADD TRADING CONTROL FIELDS
      tokenInfo.max_wallet = maxWallet ? maxWallet.toString() : '0';
      tokenInfo.max_transaction = maxTransaction ? maxTransaction.toString() : '0';
      tokenInfo.trading_enabled = Boolean(tradingEnabled);
      tokenInfo.launch_block = Number(launchBlock);
      
      this.logger.info(`Fetched COMPLETE token info for ${address}:`, {
        hasImage: !!image,
        hasDescription: !!description,
        hasSocials: !!(twitter || telegram || website),
        tradingEnabled: tokenInfo.trading_enabled
      });
      
      return tokenInfo;
    } catch (error) {
      this.logger.error(`Error getting token info for ${address}:`, error);
      return null;
    }
  }

  private async checkTokenSafety(token: Token, analytics: TokenAnalytics): Promise<void> {
    const alerts: Alert[] = [];
    
    // Check for honeypot
    if (analytics.isHoneypot) {
      alerts.push({
        id: `honeypot-${token.address}`,
        type: 'HONEYPOT_DETECTED',
        severity: 'CRITICAL',
        tokenAddress: token.address,
        message: `⚠️ HONEYPOT DETECTED: ${token.name} (${token.symbol})`,
        data: { token },
        timestamp: Date.now(),
      });
    }
    
    // Check rug score
    if (analytics.rugScore > 80) {
      alerts.push({
        id: `high-rug-risk-${token.address}`,
        type: 'RUG_WARNING',
        severity: 'HIGH',
        tokenAddress: token.address,
        message: `⚠️ HIGH RUG RISK: ${token.name} has a rug score of ${analytics.rugScore}/100`,
        data: { token, rugScore: analytics.rugScore },
        timestamp: Date.now(),
      });
    }
    
    // Check ownership concentration
    if (analytics.ownershipConcentration > 50) {
      alerts.push({
        id: `ownership-concentration-${token.address}`,
        type: 'WHALE_ACTIVITY',
        severity: 'MEDIUM',
        tokenAddress: token.address,
        message: `⚠️ High ownership concentration: ${analytics.ownershipConcentration.toFixed(2)}%`,
        data: { token, concentration: analytics.ownershipConcentration },
        timestamp: Date.now(),
      });
    }
    
    // Check for high taxes
    if (analytics.buyTax > 10 || analytics.sellTax > 10) {
      alerts.push({
        id: `high-tax-${token.address}`,
        type: 'RUG_WARNING',
        severity: 'MEDIUM',
        tokenAddress: token.address,
        message: `⚠️ High taxes detected: Buy ${analytics.buyTax}%, Sell ${analytics.sellTax}%`,
        data: { token, buyTax: analytics.buyTax, sellTax: analytics.sellTax },
        timestamp: Date.now(),
      });
    }
    
    // Send all alerts
    for (const alert of alerts) {
      await this.alertService.sendAlert(alert);
    }
  }

  private async cacheTokenData(token: Token, analytics: TokenAnalytics): Promise<void> {
    try {
      const key = `token:${token.address}`;
      const data = JSON.stringify({ token, analytics });
      
      await this.redis.setEx(key, 300, data); // Cache for 5 minutes
      
      // Also cache in sorted sets for quick lookups
      await this.redis.zAdd('tokens:by_creation', {
        score: token.createdAt,
        value: token.address,
      });
      
      await this.redis.zAdd('tokens:by_rug_score', {
        score: analytics.rugScore,
        value: token.address,
      });
      
      await this.redis.zAdd('tokens:by_liquidity', {
        score: analytics.liquidityUSD,
        value: token.address,
      });
      
    } catch (error) {
      this.logger.error('Error caching token data:', error);
    }
  }

  private async publishTokenEvent(event: string, data: any): Promise<void> {
    try {
      const eventData = {
        event,
        data,
        timestamp: Date.now(),
      };
      
      // Publish to both channels for backward compatibility
      await Promise.all([
        this.redis.publish('token-events', JSON.stringify(eventData)),
        // Also publish to WebSocket channel for new tokens
        event === 'NEW_TOKEN' ? 
          this.redis.publish('websocket:new_token', JSON.stringify(data)) : 
          Promise.resolve(),
      ]);
    } catch (error) {
      this.logger.error('Error publishing token event:', error);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}