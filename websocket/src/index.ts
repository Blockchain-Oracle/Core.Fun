import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionManager } from './services/SubscriptionManager';
import { ConnectionManager } from './services/ConnectionManager';
import { createRedisClient, createLogger } from '@core-meme/shared';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Logger
const logger = createLogger({ service: 'websocket-server' });

// Redis clients for pub/sub (integrates with blockchain-monitor)
const redisSub = createRedisClient();

// Database-backed subscription manager
const subscriptionManager = new SubscriptionManager();

// Connection manager (still in-memory for active WebSocket connections)
const connectionManager = new ConnectionManager();

// Health check endpoint
app.get('/health', async (_req, res) => {
  const stats = await subscriptionManager.getConnectionStats();
  res.json({
    status: 'ok',
    ...stats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Stats endpoint
app.get('/stats', async (_req, res) => {
  const stats = await subscriptionManager.getConnectionStats();
  res.json(stats);
});

// WebSocket connection handler
wss.on('connection', async (ws, req) => {
  const clientId = uuidv4();
  const ipAddress = req.socket.remoteAddress || 'unknown';
  
  // Register connection in both memory (for WS object) and database
  connectionManager.addConnection(ws, req);
  await subscriptionManager.addConnection(clientId, ipAddress, {
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
  });
  
  logger.info(`New WebSocket connection: ${clientId} from ${ipAddress}`);
  
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
          await handleSubscribe(clientId, ws, message);
          break;
          
        case 'unsubscribe':
          await handleUnsubscribe(clientId, ws, message);
          break;
          
        case 'ping':
          await subscriptionManager.updateConnectionPing(clientId);
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
          }));
      }
      
      // Update activity
      await subscriptionManager.updateActivity(clientId);
      
    } catch (error) {
      logger.error(`Error handling message from ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
      }));
    }
  });

  // Handle disconnection
  ws.on('close', async () => {
    await subscriptionManager.removeConnection(clientId);
    connectionManager.removeConnection(clientId);
    logger.info(`WebSocket disconnected: ${clientId}`);
  });

  // Handle errors
  ws.on('error', async (error) => {
    logger.error(`WebSocket error for ${clientId}:`, error);
    await subscriptionManager.removeConnection(clientId);
    connectionManager.removeConnection(clientId);
  });
});

async function handleSubscribe(clientId: string, ws: WebSocket, message: any) {
  const { channel, params } = message;
  
  try {
    // Validate channel
    const validChannels = ['prices', 'tokens', 'trades', 'alerts'];
    if (!validChannels.includes(channel)) {
      throw new Error(`Invalid channel: ${channel}`);
    }
    
    // Store subscription in database
    await subscriptionManager.addSubscription(clientId, channel, params);
    
    ws.send(JSON.stringify({
      type: 'subscribed',
      channel,
      params,
    }));
    
    logger.info(`Client ${clientId} subscribed to ${channel}`);
    
    // Send initial data based on channel
    await sendInitialData(clientId, ws, channel, params);
    
  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
    }));
  }
}

async function handleUnsubscribe(clientId: string, ws: WebSocket, message: any) {
  const { channel } = message;
  
  try {
    await subscriptionManager.removeSubscription(clientId, channel);
    
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      channel,
    }));
    
    logger.info(`Client ${clientId} unsubscribed from ${channel}`);
    
  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
    }));
  }
}

async function sendInitialData(clientId: string, ws: WebSocket, channel: string, _params: any) {
  // Query database for initial data based on channel
  // This would connect to the blockchain-monitor's database
  
  switch (channel) {
    case 'prices':
      // Query token_analytics table for current prices
      // Send to client
      break;
      
    case 'tokens':
      // Query tokens table for recent tokens
      // Send to client
      break;
      
    case 'trades':
      // Query trades table for recent trades
      // Send to client
      break;
      
    case 'alerts':
      // Query alerts table for recent alerts
      // Send to client
      break;
  }
}

// Redis subscription handlers - receives events from blockchain-monitor
redisSub.on('message', async (channel, message) => {
  try {
    const data = JSON.parse(message);
    
    logger.debug(`Received from Redis channel ${channel}:`, data);
    
    switch (channel) {
      case 'websocket:alerts':
        await broadcastAlert(data);
        break;
        
      case 'websocket:new_token':
        await broadcastNewToken(data);
        break;
        
      case 'websocket:trade':
        await broadcastTrade(data);
        break;
        
      case 'websocket:price_update':
        await broadcastPriceUpdate(data);
        break;
        
      default:
        logger.warn(`Unknown Redis channel: ${channel}`);
    }
  } catch (error) {
    logger.error('Error processing Redis message:', error);
  }
});

async function broadcastAlert(alert: any) {
  // Get all clients subscribed to alerts
  const subscribers = await subscriptionManager.getSubscribersByChannel('alerts');
  
  for (const clientId of subscribers) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'data',
        channel: 'alerts',
        data: alert,
        timestamp: Date.now(),
      }));
    }
  }
}

async function broadcastNewToken(token: any) {
  // Get all clients subscribed to new tokens
  const subscribers = await subscriptionManager.getSubscribersByChannel('tokens');
  
  for (const clientId of subscribers) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'data',
        channel: 'tokens',
        data: token,
        timestamp: Date.now(),
      }));
    }
  }
}

async function broadcastTrade(trade: any) {
  // Get all clients subscribed to this token's trades
  const subscribers = await subscriptionManager.getSubscribersByTokenAddress(trade.tokenAddress);
  
  for (const clientId of subscribers) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'data',
        channel: 'trades',
        data: trade,
        timestamp: Date.now(),
      }));
    }
  }
}

async function broadcastPriceUpdate(priceUpdate: any) {
  // Get all clients subscribed to this token's price
  const subscribers = await subscriptionManager.getSubscribersByTokenAddress(priceUpdate.tokenAddress);
  
  for (const clientId of subscribers) {
    const ws = connectionManager.getConnection(clientId);
    if (ws) {
      ws.send(JSON.stringify({
        type: 'data',
        channel: 'prices',
        data: priceUpdate,
        timestamp: Date.now(),
      }));
    }
  }
}

// Subscribe to Redis channels used by blockchain-monitor when connected
redisSub.on('ready', () => {
  logger.info('Redis subscriber connected, subscribing to channels...');
  redisSub.subscribe('websocket:alerts');
  redisSub.subscribe('websocket:new_token');
  redisSub.subscribe('websocket:trade');
  redisSub.subscribe('websocket:price_update');
});

redisSub.on('error', (err) => {
  logger.error('Redis subscriber error:', err);
});

redisSub.on('end', () => {
  logger.warn('Redis subscriber connection ended');
});

// Cleanup inactive subscriptions periodically
setInterval(async () => {
  try {
    const cleaned = await subscriptionManager.cleanupInactiveSubscriptions(30);
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} inactive subscriptions`);
    }
  } catch (error) {
    logger.error('Error cleaning up subscriptions:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Start server
const PORT = process.env.WS_PORT || process.env.PORT || 8081;
server.listen(PORT, () => {
  logger.info(`WebSocket server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  logger.info(`Database: ${process.env.POSTGRES_DB || 'core_meme_platform'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down WebSocket server...');
  
  // Close all connections
  connectionManager.closeAll();
  
  // Close database connection
  await subscriptionManager.close();
  
  // Close Redis connection
  redisSub.disconnect();
  
  // Close server
  server.close(() => {
    logger.info('WebSocket server shut down');
    process.exit(0);
  });
});

export { wss, connectionManager, subscriptionManager };