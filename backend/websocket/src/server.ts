import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createLogger, createRedisClient } from '@core-meme/shared';
import { memeFactoryService } from '@core-meme/shared';
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
  
  // Handle subscription to alerts
  socket.on('subscribe:alerts', async (data: any) => {
    logger.info(`Socket ${socket.id} subscribing to alerts`);
    socket.join('alerts');
    socket.emit('subscribed', { channel: 'alerts' });
  });
  
  // Handle subscription to all trades
  socket.on('subscribe:trades', async (data: any) => {
    logger.info(`Socket ${socket.id} subscribing to trades`);
    socket.join('trades');
    socket.emit('subscribed', { channel: 'trades' });
  });
  
  // Handle subscription to price updates
  socket.on('subscribe:prices', async (data: any) => {
    logger.info(`Socket ${socket.id} subscribing to prices`);
    socket.join('prices');
    socket.emit('subscribed', { channel: 'prices' });
  });
  
  // Handle unsubscription from alerts
  socket.on('unsubscribe:alerts', (data: any) => {
    logger.info(`Socket ${socket.id} unsubscribing from alerts`);
    socket.leave('alerts');
    socket.emit('unsubscribed', { channel: 'alerts' });
  });
  
  // Handle unsubscription from trades
  socket.on('unsubscribe:trades', (data: any) => {
    logger.info(`Socket ${socket.id} unsubscribing from trades`);
    socket.leave('trades');
    socket.emit('unsubscribed', { channel: 'trades' });
  });
  
  // Handle unsubscription from prices
  socket.on('unsubscribe:prices', (data: any) => {
    logger.info(`Socket ${socket.id} unsubscribing from prices`);
    socket.leave('prices');
    socket.emit('unsubscribed', { channel: 'prices' });
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

// Set up Redis subscriber for blockchain monitor events
const redisSubscriber = createRedisClient();

// Redis event handlers
redisSubscriber.on('message', (channel: string, message: string) => {
  try {
    const data = JSON.parse(message);
    logger.debug(`Received Redis message on ${channel}:`, data);
    
    switch (channel) {
      case 'websocket:alerts':
        io.to('alerts').emit('alert', data);
        break;
        
      case 'websocket:new_token':
        io.to('public').emit('token:created', data);
        io.to('tokens').emit('token:created', data);
        break;
        
      case 'websocket:trade':
        io.to('trades').emit('token:traded', data);
        io.to(`token:${data.tokenAddress}`).emit('token:trade', data);
        break;
        
      case 'websocket:price_update':
        io.to('prices').emit('price:update', data);
        io.to(`token:${data.tokenAddress}`).emit('price:update', data);
        break;
        
      default:
        logger.warn(`Unknown Redis channel: ${channel}`);
    }
  } catch (error) {
    logger.error('Error processing Redis message:', error);
  }
});

// Subscribe to blockchain monitor channels
redisSubscriber.on('ready', () => {
  logger.info('Redis subscriber connected, subscribing to blockchain monitor channels...');
  redisSubscriber.subscribe('websocket:alerts');
  redisSubscriber.subscribe('websocket:new_token');
  redisSubscriber.subscribe('websocket:trade');
  redisSubscriber.subscribe('websocket:price_update');
});

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
        const tradeData = {
          type: 'buy',
          address: token,
          trader: buyer,
          amount: ethers.formatEther(amount),
          cost: ethers.formatEther(cost),
          timestamp: Number(timestamp),
          tokenInfo
        };
        
        io.to(`token:${token}`).emit('token:trade', tradeData);
        io.to('trades').emit('token:traded', tradeData); // Emit to general trades room
        
        // Emit price update
        const priceData = {
          address: token,
          price: tokenInfo?.currentPrice,
          marketCap: tokenInfo?.marketCap
        };
        
        io.to(`token:${token}`).emit('price:update', priceData);
        io.to('prices').emit('price:update', priceData); // Emit to general prices room
        
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
        const tradeData = {
          type: 'sell',
          address: token,
          trader: seller,
          amount: ethers.formatEther(amount),
          proceeds: ethers.formatEther(proceeds),
          timestamp: Number(timestamp),
          tokenInfo
        };
        
        io.to(`token:${token}`).emit('token:trade', tradeData);
        io.to('trades').emit('token:traded', tradeData); // Emit to general trades room
        
        // Emit price update
        const priceData = {
          address: token,
          price: tokenInfo?.currentPrice,
          marketCap: tokenInfo?.marketCap
        };
        
        io.to(`token:${token}`).emit('price:update', priceData);
        io.to('prices').emit('price:update', priceData); // Emit to general prices room
        
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
  
  // Close Redis subscriber
  redisSubscriber.disconnect();
  
  // Close WebSocket server
  io.close(() => {
    logger.info('WebSocket server closed');
    process.exit(0);
  });
});

// Import ethers for event processing
import { ethers } from 'ethers';

export { io };