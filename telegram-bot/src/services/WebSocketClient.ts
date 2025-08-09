import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface WebSocketClientConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private clientId: string | null = null;

  constructor(config: WebSocketClientConfig) {
    super();
    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    };
  }

  connect(): void {
    try {
      logger.info(`Connecting to WebSocket server at ${this.config.url}`);
      
      this.ws = new WebSocket(this.config.url);
      
      this.ws.on('open', () => {
        logger.info('WebSocket connection established');
        this.reconnectAttempts = 0;
        
        // Start ping interval
        this.startPingInterval();
        
        // Resubscribe to previous channels
        this.resubscribe();
        
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('close', () => {
        logger.warn('WebSocket connection closed');
        this.stopPingInterval();
        this.emit('disconnected');
        this.reconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.emit('error', error);
      });

    } catch (error) {
      logger.error('Error creating WebSocket connection:', error);
      this.reconnect();
    }
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'connected':
        this.clientId = message.clientId;
        logger.info(`Connected with client ID: ${this.clientId}`);
        break;
        
      case 'data':
        this.emit('data', message);
        this.handleDataMessage(message);
        break;
        
      case 'subscribed':
        logger.info(`Subscribed to ${message.channel}`);
        this.emit('subscribed', message);
        break;
        
      case 'unsubscribed':
        logger.info(`Unsubscribed from ${message.channel}`);
        this.emit('unsubscribed', message);
        break;
        
      case 'error':
        logger.error(`WebSocket error: ${message.message}`);
        this.emit('ws-error', message);
        break;
        
      case 'pong':
        // Pong received
        break;
        
      default:
        logger.debug('Unknown message type:', message.type);
    }
  }

  private handleDataMessage(message: any): void {
    const { channel, data } = message;
    
    switch (channel) {
      case 'alerts':
        this.emit('alert', data);
        break;
        
      case 'new_token':
        this.emit('new-token', data);
        break;
        
      case 'trade':
        this.emit('trade', data);
        break;
        
      case 'price_update':
        this.emit('price-update', data);
        break;
        
      default:
        this.emit(channel, data);
    }
  }

  subscribe(channel: string, params?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot subscribe to ${channel}: WebSocket not connected`);
      this.subscriptions.add(JSON.stringify({ channel, params }));
      return;
    }
    
    const message = {
      type: 'subscribe',
      channel,
      params: params || {},
    };
    
    this.ws.send(JSON.stringify(message));
    this.subscriptions.add(JSON.stringify({ channel, params }));
    
    logger.info(`Subscribing to ${channel}`);
  }

  unsubscribe(channel: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot unsubscribe from ${channel}: WebSocket not connected`);
      return;
    }
    
    const message = {
      type: 'unsubscribe',
      channel,
    };
    
    this.ws.send(JSON.stringify(message));
    
    // Remove from subscriptions
    this.subscriptions.forEach(sub => {
      const parsed = JSON.parse(sub);
      if (parsed.channel === channel) {
        this.subscriptions.delete(sub);
      }
    });
    
    logger.info(`Unsubscribing from ${channel}`);
  }

  private resubscribe(): void {
    if (this.subscriptions.size === 0) return;
    
    logger.info(`Resubscribing to ${this.subscriptions.size} channels`);
    
    this.subscriptions.forEach(sub => {
      const { channel, params } = JSON.parse(sub);
      const message = {
        type: 'subscribe',
        channel,
        params: params || {},
      };
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    });
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      this.emit('max-reconnect-attempts');
      return;
    }
    
    this.reconnectAttempts++;
    
    logger.info(`Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.config.reconnectInterval);
  }

  disconnect(): void {
    this.stopPingInterval();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscriptions.clear();
    this.clientId = null;
    
    logger.info('WebSocket client disconnected');
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getClientId(): string | null {
    return this.clientId;
  }
}