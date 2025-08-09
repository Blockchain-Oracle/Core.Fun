import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import Redis from 'ioredis';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { PriceStreamHandler } from './handlers/PriceStreamHandler';
import { TokenStreamHandler } from './handlers/TokenStreamHandler';
import { TradeStreamHandler } from './handlers/TradeStreamHandler';
import { AlertStreamHandler } from './handlers/AlertStreamHandler';
import { ConnectionManager } from './services/ConnectionManager';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Redis clients for pub/sub
const redisPub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Core blockchain provider
const provider = new ethers.JsonRpcProvider(
  process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
);

// Connection manager
const connectionManager = new ConnectionManager();

// Stream handlers
const priceStreamHandler = new PriceStreamHandler(provider, redisPub);
const tokenStreamHandler = new TokenStreamHandler(provider, redisPub);
const tradeStreamHandler = new TradeStreamHandler(provider, redisPub);
const alertStreamHandler = new AlertStreamHandler(redisPub);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: connectionManager.getConnectionCount(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = connectionManager.addConnection(ws, req);
  
  logger.info(`New WebSocket connection: ${clientId}`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now(),
  }));

  // Handle client messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          await handleSubscribe(clientId, message);
          break;
        case 'unsubscribe':
          await handleUnsubscribe(clientId, message);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
          }));
      }
    } catch (error) {
      logger.error(`Error handling message from ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    connectionManager.removeConnection(clientId);
    logger.info(`WebSocket disconnected: ${clientId}`);
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error(`WebSocket error for ${clientId}:`, error);
    connectionManager.removeConnection(clientId);
  });
});

async function handleSubscribe(clientId: string, message: any) {
  const { channel, params } = message;
  
  try {
    switch (channel) {
      case 'prices':
        await priceStreamHandler.subscribe(clientId, params);
        break;
      case 'tokens':
        await tokenStreamHandler.subscribe(clientId, params);
        break;
      case 'trades':
        await tradeStreamHandler.subscribe(clientId, params);
        break;
      case 'alerts':
        await alertStreamHandler.subscribe(clientId, params);
        break;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
    
    connectionManager.addSubscription(clientId, channel, params);
    
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'subscribed',
        channel,
        params,
      }));
    }
  } catch (error: any) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message,
      }));
    }
  }
}

async function handleUnsubscribe(clientId: string, message: any) {
  const { channel } = message;
  
  try {
    switch (channel) {
      case 'prices':
        await priceStreamHandler.unsubscribe(clientId);
        break;
      case 'tokens':
        await tokenStreamHandler.unsubscribe(clientId);
        break;
      case 'trades':
        await tradeStreamHandler.unsubscribe(clientId);
        break;
      case 'alerts':
        await alertStreamHandler.unsubscribe(clientId);
        break;
    }
    
    connectionManager.removeSubscription(clientId, channel);
    
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'unsubscribed',
        channel,
      }));
    }
  } catch (error: any) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message,
      }));
    }
  }
}

// Redis subscription for broadcasting
redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);
    
    // Broadcast to relevant clients
    connectionManager.broadcast(channel, data);
  } catch (error) {
    logger.error('Error broadcasting message:', error);
  }
});

// Subscribe to Redis channels
redisSub.subscribe('price-updates');
redisSub.subscribe('new-tokens');
redisSub.subscribe('trades');
redisSub.subscribe('alerts');

// Start stream handlers
priceStreamHandler.start();
tokenStreamHandler.start();
tradeStreamHandler.start();
alertStreamHandler.start();

// Start server
const PORT = process.env.WS_PORT || 3003;
server.listen(PORT, () => {
  logger.info(`WebSocket server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Core RPC: ${process.env.CORE_RPC_URL || 'https://rpc.coredao.org'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down WebSocket server...');
  
  // Close all connections
  connectionManager.closeAll();
  
  // Stop handlers
  await priceStreamHandler.stop();
  await tokenStreamHandler.stop();
  await tradeStreamHandler.stop();
  await alertStreamHandler.stop();
  
  // Close Redis connections
  redisPub.disconnect();
  redisSub.disconnect();
  
  // Close server
  server.close(() => {
    logger.info('WebSocket server shut down');
    process.exit(0);
  });
});

export { wss, connectionManager };