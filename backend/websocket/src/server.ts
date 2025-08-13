import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createLogger, createRedisClient } from '@core-meme/shared';
import { memeFactoryService } from '../../api/src/services/MemeFactoryService';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const logger = createLogger({ service: 'websocket-server' });
const redis = createRedisClient();

// Create Socket.IO server with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || 
            ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.WS_PORT || 8081;

// Track connected users and their subscriptions
const userSessions = new Map<string, {
  userId: string;
  telegramId: number;
  subscriptions: Set<string>;
}>();

// Authenticate socket connections
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      // Allow anonymous connections for public data
      logger.info('Anonymous connection from', socket.handshake.address);
      return next();
    }
    
    // Verify JWT token
    jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret', (err: any, decoded: any) => {
      if (err) {
        logger.warn('Invalid token from', socket.handshake.address);
        return next(new Error('Authentication failed'));
      }
      
      // Attach user info to socket
      (socket as any).userId = decoded.userId;
      (socket as any).telegramId = decoded.telegramId;
      (socket as any).authenticated = true;
      
      logger.info(`Authenticated connection from user ${decoded.userId}`);
      next();
    });
  } catch (error) {
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Handle socket connections
io.on('connection', (socket) => {
  const userId = (socket as any).userId;
  const authenticated = (socket as any).authenticated;
  
  logger.info(`Client connected: ${socket.id}, authenticated: ${authenticated}`);
  
  // Store user session if authenticated
  if (authenticated && userId) {
    userSessions.set(socket.id, {
      userId,
      telegramId: (socket as any).telegramId,
      subscriptions: new Set()
    });
    
    // Join user-specific room
    socket.join(`user:${userId}`);
  }
  
  // Join public room for all users
  socket.join('public');
  
  // Handle token subscription
  socket.on('subscribe:token', async (data: { address: string }) => {
    try {
      const { address } = data;
      
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        socket.emit('error', { message: 'Invalid token address' });
        return;
      }
      
      logger.info(`Socket ${socket.id} subscribing to token ${address}`);
      
      // Join token-specific room
      socket.join(`token:${address}`);
      
      // Add to user's subscriptions if authenticated
      const session = userSessions.get(socket.id);
      if (session) {
        session.subscriptions.add(address);
      }
      
      // Send current token info
      const tokenInfo = await memeFactoryService.getTokenInfo(address);
      if (tokenInfo) {
        socket.emit('token:info', tokenInfo);
      }
      
      // Send recent trades
      const trades = await memeFactoryService.getRecentTrades(address, 10);
      socket.emit('token:trades', { address, trades });
      
    } catch (error) {
      logger.error('Error subscribing to token:', error);
      socket.emit('error', { message: 'Failed to subscribe to token' });
    }
  });
  
  // Handle token unsubscription
  socket.on('unsubscribe:token', (data: { address: string }) => {
    const { address } = data;
    
    logger.info(`Socket ${socket.id} unsubscribing from token ${address}`);
    
    // Leave token room
    socket.leave(`token:${address}`);
    
    // Remove from user's subscriptions
    const session = userSessions.get(socket.id);
    if (session) {
      session.subscriptions.delete(address);
    }
  });
  
  // Handle request for all tokens
  socket.on('request:tokens', async () => {
    try {
      const tokens = await memeFactoryService.getAllTokens();
      socket.emit('tokens:list', tokens);
    } catch (error) {
      logger.error('Error fetching tokens:', error);
      socket.emit('error', { message: 'Failed to fetch tokens' });
    }
  });
  
  // Handle request for user's transactions
  socket.on('request:transactions', async () => {
    if (!authenticated) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    
    try {
      const key = `tx:history:${userId}`;
      const history = await redis.get(key);
      const transactions = history ? JSON.parse(history) : [];
      socket.emit('user:transactions', transactions);
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      socket.emit('error', { message: 'Failed to fetch transactions' });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    
    // Clean up user session
    userSessions.delete(socket.id);
  });
  
  // Handle errors
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
});

// Import StakingService
import { StakingService } from './services/StakingService';

const stakingService = new StakingService();

// Set up blockchain event listeners
function setupBlockchainListeners() {
  logger.info('Setting up blockchain event listeners...');
  
  // Setup MemeFactory event listeners
  memeFactoryService.setupEventListeners({
    onTokenCreated: async (event) => {
      try {
        const { token, creator, name, symbol, timestamp } = event.args as any;
        
        logger.info(`New token created: ${symbol} at ${token}`);
        
        // Get full token info
        const tokenInfo = await memeFactoryService.getTokenInfo(token);
        
        // Emit to all connected clients
        io.to('public').emit('token:created', {
          address: token,
          creator,
          name,
          symbol,
          timestamp: Number(timestamp),
          tokenInfo
        });
        
      } catch (error) {
        logger.error('Error handling TokenCreated event:', error);
      }
    },
    
    onTokenPurchased: async (event) => {
      try {
        const { token, buyer, amount, cost, timestamp } = event.args as any;
        
        logger.info(`Token purchased: ${token} by ${buyer}`);
        
        // Get updated token info
        const tokenInfo = await memeFactoryService.getTokenInfo(token);
        
        // Emit to token subscribers
        io.to(`token:${token}`).emit('token:trade', {
          type: 'buy',
          address: token,
          trader: buyer,
          amount: ethers.formatEther(amount),
          cost: ethers.formatEther(cost),
          timestamp: Number(timestamp),
          tokenInfo
        });
        
        // Emit price update
        io.to(`token:${token}`).emit('price:update', {
          address: token,
          price: tokenInfo?.currentPrice,
          marketCap: tokenInfo?.marketCap
        });
        
        // Emit to specific user if they're connected
        io.to(`user:${buyer}`).emit('user:trade', {
          type: 'buy',
          token,
          amount: ethers.formatEther(amount),
          cost: ethers.formatEther(cost),
          timestamp: Number(timestamp)
        });
        
      } catch (error) {
        logger.error('Error handling TokenPurchased event:', error);
      }
    },
    
    onTokenSold: async (event) => {
      try {
        const { token, seller, amount, proceeds, timestamp } = event.args as any;
        
        logger.info(`Token sold: ${token} by ${seller}`);
        
        // Get updated token info
        const tokenInfo = await memeFactoryService.getTokenInfo(token);
        
        // Emit to token subscribers
        io.to(`token:${token}`).emit('token:trade', {
          type: 'sell',
          address: token,
          trader: seller,
          amount: ethers.formatEther(amount),
          proceeds: ethers.formatEther(proceeds),
          timestamp: Number(timestamp),
          tokenInfo
        });
        
        // Emit price update
        io.to(`token:${token}`).emit('price:update', {
          address: token,
          price: tokenInfo?.currentPrice,
          marketCap: tokenInfo?.marketCap
        });
        
        // Emit to specific user if they're connected
        io.to(`user:${seller}`).emit('user:trade', {
          type: 'sell',
          token,
          amount: ethers.formatEther(amount),
          proceeds: ethers.formatEther(proceeds),
          timestamp: Number(timestamp)
        });
        
      } catch (error) {
        logger.error('Error handling TokenSold event:', error);
      }
    },
    
    onTokenLaunched: async (event) => {
      try {
        const { token, liquidityAdded, timestamp } = event.args as any;
        
        logger.info(`Token launched: ${token}`);
        
        // Get updated token info
        const tokenInfo = await memeFactoryService.getTokenInfo(token);
        
        // Emit to all clients
        io.to('public').emit('token:launched', {
          address: token,
          liquidityAdded: ethers.formatEther(liquidityAdded),
          timestamp: Number(timestamp),
          tokenInfo
        });
        
        // Emit to token subscribers
        io.to(`token:${token}`).emit('token:status', {
          address: token,
          status: 'launched',
          tokenInfo
        });
        
      } catch (error) {
        logger.error('Error handling TokenLaunched event:', error);
      }
    }
  });

  // Setup Staking event listeners
  stakingService.setupEventListeners({
    onStaked: async (event) => {
      logger.info(`Staking event: User staked ${event.amount} tokens`);
      
      // Emit to all clients
      io.to('public').emit('staking:staked', event);
      
      // Emit to specific user if connected
      io.to(`user:${event.user}`).emit('user:staked', event);
    },
    
    onUnstaked: async (event) => {
      logger.info(`Staking event: User unstaked ${event.amount} tokens`);
      
      // Emit to all clients
      io.to('public').emit('staking:unstaked', event);
      
      // Emit to specific user if connected
      io.to(`user:${event.user}`).emit('user:unstaked', event);
    },
    
    onRewardsClaimed: async (event) => {
      logger.info(`Staking event: User claimed ${event.amount} rewards`);
      
      // Emit to specific user if connected
      io.to(`user:${event.user}`).emit('user:rewards:claimed', event);
    },
    
    onRevenueDistributed: async (event) => {
      logger.info(`Staking event: Revenue distributed ${event.amount} CORE`);
      
      // Emit to all stakers
      io.to('public').emit('staking:revenue:distributed', event);
    },
    
    onTierUpdated: async (event) => {
      logger.info(`Staking event: User tier updated to ${event.tierName}`);
      
      // Emit to specific user if connected
      io.to(`user:${event.user}`).emit('user:tier:updated', event);
    }
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: io.sockets.sockets.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
httpServer.listen(PORT, () => {
  logger.info(`WebSocket server running on port ${PORT}`);
  
  // Set up blockchain listeners after a short delay
  setTimeout(() => {
    setupBlockchainListeners();
  }, 2000);
});

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  
  // Remove blockchain listeners
  memeFactoryService.removeAllListeners();
  stakingService.removeAllListeners();
  
  // Close WebSocket server
  io.close(() => {
    logger.info('WebSocket server closed');
    process.exit(0);
  });
});

// Import ethers for event processing
import { ethers } from 'ethers';

export { io };