import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@core-meme/shared';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import tokenRoutes from './routes/tokens';
import tradingRoutes from './routes/trading';
import statsRoutes from './routes/stats';
import subscriptionRoutes from './routes/subscription';
import stakingRoutes from './routes/staking';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 3001;
const logger = createLogger({ service: 'api', enableFileLogging: false });

// Middleware
app.use(helmet());

// CORS configuration - allow multiple origins
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', authRoutes);
app.use('/api', walletRoutes);
app.use('/api', tokenRoutes);
app.use('/api', tradingRoutes);
app.use('/api', statsRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/staking', stakingRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});