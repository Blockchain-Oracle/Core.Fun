import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { CoreAPIService } from './services/CoreAPIService';
import { tokenRouter } from './routes/token';
import { contractRouter } from './routes/contract';
import { priceRouter } from './routes/price';
import { healthRouter } from './routes/health';
import { accountRouter } from './routes/account';
import { statsRouter } from './routes/stats';
import { authRouter } from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { createLogger } from '@core-meme/shared';
import type winston from 'winston';

export class Server {
  private app: express.Application;
  private coreAPI: CoreAPIService;
  private logger: winston.Logger;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    // Initialize with network from environment
    const network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
    this.coreAPI = new CoreAPIService({ network });
    
    // Initialize logger using shared logger
    this.logger = createLogger({ 
      service: 'core-api-service',
      enableFileLogging: true
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3002'];
    this.app.use(cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        if (corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      message: 'Too many requests from this IP, please try again later.',
    });
    this.app.use('/api', limiter);

    // Request logging
    this.app.use(requestLogger);

    // Make CoreAPI available to routes
    this.app.locals.coreAPI = this.coreAPI;
  }

  private setupRoutes(): void {
    // Health check
    this.app.use('/health', healthRouter);

    // API routes
    this.app.use('/api/auth', authRouter);
    this.app.use('/api/token', tokenRouter);
    this.app.use('/api/contract', contractRouter);
    this.app.use('/api/price', priceRouter);
    this.app.use('/api/account', accountRouter);
    this.app.use('/api/stats', statsRouter);

    // 404 handler
    this.app.use('*', (_req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        this.logger.info(`🚀 Core API Service running on port ${this.port}`);
        this.logger.info(`📡 Network: ${process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet'}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    await this.coreAPI.close();
    this.logger.info('Server stopped');
  }

  public getApp(): express.Application {
    return this.app;
  }
}