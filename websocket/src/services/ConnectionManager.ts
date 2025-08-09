import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

interface Connection {
  id: string;
  ws: WebSocket;
  ip: string;
  connectedAt: Date;
  subscriptions: Map<string, any>;
  lastActivity: Date;
}

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private channelSubscribers: Map<string, Set<string>> = new Map();

  addConnection(ws: WebSocket, req: IncomingMessage): string {
    const id = uuidv4();
    const ip = req.socket.remoteAddress || 'unknown';
    
    const connection: Connection = {
      id,
      ws,
      ip,
      connectedAt: new Date(),
      subscriptions: new Map(),
      lastActivity: new Date(),
    };
    
    this.connections.set(id, connection);
    
    // Setup heartbeat
    this.setupHeartbeat(id);
    
    return id;
  }

  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    
    // Remove from all channel subscribers
    connection.subscriptions.forEach((_, channel) => {
      const subscribers = this.channelSubscribers.get(channel);
      if (subscribers) {
        subscribers.delete(id);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channel);
        }
      }
    });
    
    // Close WebSocket if still open
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
    }
    
    this.connections.delete(id);
  }

  getConnection(id: string): WebSocket | null {
    const connection = this.connections.get(id);
    return connection ? connection.ws : null;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  addSubscription(clientId: string, channel: string, params: any): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;
    
    connection.subscriptions.set(channel, params);
    
    // Add to channel subscribers
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(clientId);
  }

  removeSubscription(clientId: string, channel: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;
    
    connection.subscriptions.delete(channel);
    
    // Remove from channel subscribers
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }
  }

  broadcast(channel: string, data: any): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) return;
    
    const message = JSON.stringify({
      type: 'data',
      channel,
      data,
      timestamp: Date.now(),
    });
    
    subscribers.forEach(clientId => {
      const connection = this.connections.get(clientId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(message);
          connection.lastActivity = new Date();
        } catch (error) {
          logger.error(`Failed to send to client ${clientId}:`, error);
          this.removeConnection(clientId);
        }
      }
    });
  }

  broadcastToClient(clientId: string, data: any): void {
    const connection = this.connections.get(clientId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(data));
        connection.lastActivity = new Date();
      } catch (error) {
        logger.error(`Failed to send to client ${clientId}:`, error);
        this.removeConnection(clientId);
      }
    }
  }

  private setupHeartbeat(clientId: string): void {
    const interval = setInterval(() => {
      const connection = this.connections.get(clientId);
      if (!connection) {
        clearInterval(interval);
        return;
      }
      
      // Check if connection is still alive
      if (connection.ws.readyState !== WebSocket.OPEN) {
        this.removeConnection(clientId);
        clearInterval(interval);
        return;
      }
      
      // Check for inactive connections (5 minutes)
      const inactiveTime = Date.now() - connection.lastActivity.getTime();
      if (inactiveTime > 5 * 60 * 1000) {
        logger.info(`Closing inactive connection: ${clientId}`);
        this.removeConnection(clientId);
        clearInterval(interval);
        return;
      }
      
      // Send ping
      try {
        connection.ws.ping();
      } catch (error) {
        logger.error(`Ping failed for ${clientId}:`, error);
        this.removeConnection(clientId);
        clearInterval(interval);
      }
    }, 30000); // Every 30 seconds
  }

  closeAll(): void {
    this.connections.forEach((connection, id) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, 'Server shutting down');
      }
    });
    this.connections.clear();
    this.channelSubscribers.clear();
  }

  getStats(): any {
    const channelStats: any = {};
    this.channelSubscribers.forEach((subscribers, channel) => {
      channelStats[channel] = subscribers.size;
    });
    
    return {
      totalConnections: this.connections.size,
      channelSubscribers: channelStats,
      connections: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        ip: conn.ip,
        connectedAt: conn.connectedAt,
        subscriptions: Array.from(conn.subscriptions.keys()),
        lastActivity: conn.lastActivity,
      })),
    };
  }
}