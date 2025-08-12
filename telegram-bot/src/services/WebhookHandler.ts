import express, { Request, Response } from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { createLogger } from '@core-meme/shared';
import { AuthHandler } from '../auth/AuthHandler';
import { DatabaseService } from './DatabaseService';
import { SessionManager } from '../auth/SessionManager';

export class WebhookHandler {
  private app: express.Application;
  private authHandler: AuthHandler;
  private db: DatabaseService;
  private logger = createLogger({ service: 'telegram-webhook' });

  constructor(
    db: DatabaseService, 
    sessionManager: SessionManager,
    port: number = 3002
  ) {
    this.app = express();
    this.db = db;
    this.authHandler = new AuthHandler(db, sessionManager);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.startServer(port);
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    }));
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'telegram-webhook'
      });
    });

    // Quick image generation route for testing
    this.app.get('/webhook/test-image', async (req: Request, res: Response) => {
      try {
        const { ImageGenerator } = await import('../services/ImageGenerator');
        const gen = new ImageGenerator();
        const buffer = await gen.generateTokenCard({
          symbol: 'MEME',
          name: 'Meme Token',
          price: 0.00001234,
          priceChange24h: 12.34,
          marketCap: 1_000_000,
          liquidity: 500_000,
          volume24h: 100_000,
          holders: 1234,
          isHoneypot: false,
          rugScore: 20,
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(buffer);
      } catch (err) {
        this.logger.error('Failed to serve test image:', err);
        res.status(500).json({ success: false, error: 'image_generation_failed' });
      }
    });

    // Web App authentication endpoint
    this.app.post('/webhook/auth/webapp', async (req: Request, res: Response) => {
      try {
        const { initData } = req.body;

        if (!initData) {
          return res.status(400).json({
            success: false,
            error: 'Missing initData parameter'
          });
        }

        // Parse the Web App data
        const webAppData = this.parseWebAppData(initData);
        if (!webAppData) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Web App data format'
          });
        }

        // Process authentication
        const result = await this.authHandler.processWebAppData(webAppData);

        if (result.success) {
          res.json({
            success: true,
            session: {
              token: result.token,
              user: result.user,
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
            },
            isNewUser: !result.user.createdAt || 
              (Date.now() - new Date(result.user.createdAt).getTime()) < 60000
          });
        } else {
          res.status(401).json({
            success: false,
            error: result.error || 'Authentication failed'
          });
        }

      } catch (error: any) {
        this.logger.error('Web App auth webhook error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Generate auth code for deep link authentication
    this.app.post('/webhook/auth/init', async (req: Request, res: Response) => {
      try {
        const { redirectUrl } = req.body;
        
        const authCode = await this.authHandler.generateAuthCode();
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CoreMemeBot';
        
        res.json({
          success: true,
          authCode,
          deepLink: `https://t.me/${botUsername}?start=auth_${authCode}`,
          expiresIn: 300 // 5 minutes
        });

      } catch (error: any) {
        this.logger.error('Auth init webhook error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to initialize authentication'
        });
      }
    });

    // Wallet information endpoint
    this.app.get('/webhook/wallet/:telegramId', async (req: Request, res: Response) => {
      try {
        const telegramId = parseInt(req.params.telegramId);
        
        if (!telegramId) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Telegram ID'
          });
        }

        // Get real wallet data from database
        const userData = await this.db.getUserByTelegramId(telegramId);
        
        if (!userData || !userData.walletAddress) {
          return res.json({
            success: true,
            wallet: null
          });
        }

        // Get real balances from Core blockchain - using mainnet RPC
        const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL || 'https://rpc.coredao.org');
        const coreBalance = await provider.getBalance(userData.walletAddress);
        
        // Get user's tracked tokens from database (just the addresses they're interested in)
        // In production, this would fetch from database
        const trackedTokens: any[] = [];
        
        // Fetch REAL token balances from the Core blockchain
        const tokenBalances = await Promise.all(
          trackedTokens.map(async (token: any) => {
            try {
              const tokenContract = new ethers.Contract(
                token.address,
                [
                  'function balanceOf(address) view returns (uint256)',
                  'function decimals() view returns (uint8)',
                  'function symbol() view returns (string)'
                ],
                provider
              );
              
              const [balance, decimals, symbol] = await Promise.all([
                tokenContract.balanceOf(userData.walletAddress),
                tokenContract.decimals(),
                tokenContract.symbol().catch(() => token.symbol || 'UNKNOWN')
              ]);
              
              return {
                address: token.address,
                symbol,
                balance: ethers.formatUnits(balance, decimals),
                decimals,
                rawBalance: balance.toString()
              };
            } catch (error) {
              this.logger.warn(`Failed to fetch balance for token ${token.address}:`, error);
              return null;
            }
          })
        );
        
        // Filter out failed fetches
        const validTokenBalances = tokenBalances.filter(Boolean);
        
        res.json({
          success: true,
          wallet: {
            address: userData.walletAddress,
            balance: ethers.formatEther(coreBalance),
            coreBalance: ethers.formatEther(coreBalance),
            tokenBalances: validTokenBalances
          }
        });

      } catch (error: any) {
        this.logger.error('Wallet info webhook error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get wallet information'
        });
      }
    });

    // Error handling
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      this.logger.error('Webhook error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Not found'
      });
    });
  }

  private parseWebAppData(initData: string): any {
    try {
      const urlParams = new URLSearchParams(initData);
      const data: any = {};
      
      for (const [key, value] of urlParams.entries()) {
        data[key] = value;
      }
      
      // Validate required fields
      if (!data.user || !data.hash || !data.auth_date) {
        return null;
      }
      
      return data;
    } catch (error) {
      this.logger.error('Failed to parse Web App data:', error);
      return null;
    }
  }

  private startServer(port: number) {
    this.app.listen(port, () => {
      this.logger.info(`Telegram webhook server running on port ${port}`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}