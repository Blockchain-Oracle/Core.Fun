import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { createLogger } from '@core-meme/shared';

export interface SocketIOClientConfig {
  url: string;
  auth?: {
    token?: string;
  };
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export class SocketIOClient extends EventEmitter {
  private logger = createLogger({ service: 'socketio-client' });
  private socket: Socket | null = null;
  private config: SocketIOClientConfig;
  private subscriptions: Set<string> = new Set();
  
  constructor(config: SocketIOClientConfig) {
    super();
    this.config = config;
  }
  
  connect(): void {
    try {
      this.logger.info(`Connecting to Socket.IO server at ${this.config.url}`);
      
      this.socket = io(this.config.url, {
        auth: this.config.auth || {},
        reconnectionAttempts: this.config.reconnectionAttempts || 10,
        reconnectionDelay: this.config.reconnectionDelay || 5000,
      });
      
      this.setupEventHandlers();
    } catch (error) {
      this.logger.error('Error creating Socket.IO connection:', error);
    }
  }
  
  private setupEventHandlers(): void {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      this.logger.info('Socket.IO connection established');
      this.emit('connected');
      
      // Resubscribe to channels after reconnection
      this.subscriptions.forEach(channel => {
        this.subscribe(channel);
      });
    });
    
    this.socket.on('disconnect', (reason) => {
      this.logger.warn('Socket.IO disconnected:', reason);
      this.emit('disconnected');
    });
    
    this.socket.on('error', (error) => {
      this.logger.error('Socket.IO error:', error);
      this.emit('error', error);
    });
    
    // Handle data events
    this.socket.on('token:created', (data) => {
      this.emit('token:created', data);
    });
    
    this.socket.on('token:traded', (data) => {
      this.emit('token:traded', data);
    });
    
    this.socket.on('token:launched', (data) => {
      this.emit('token:launched', data);
    });
    
    this.socket.on('price:update', (data) => {
      this.emit('price:update', data);
    });
    
    this.socket.on('alert', (data) => {
      this.emit('alert', data);
    });
  }
  
  subscribe(channel: string): void {
    if (!this.socket || !this.socket.connected) {
      this.logger.warn('Cannot subscribe - not connected');
      return;
    }
    
    const [type, address] = channel.split(':');
    
    switch (type) {
      case 'token':
        this.socket.emit('subscribe:token', { address });
        break;
      case 'alerts':
        this.socket.emit('subscribe:alerts', {});
        break;
      case 'trades':
        this.socket.emit('subscribe:trades', {});
        break;
      case 'prices':
        this.socket.emit('subscribe:prices', {});
        break;
    }
    
    this.subscriptions.add(channel);
    this.logger.info(`Subscribing to ${channel}`);
  }
  
  unsubscribe(channel: string): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    
    const [type, address] = channel.split(':');
    
    switch (type) {
      case 'token':
        this.socket.emit('unsubscribe:token', { address });
        break;
      case 'alerts':
        this.socket.emit('unsubscribe:alerts', {});
        break;
      case 'trades':
        this.socket.emit('unsubscribe:trades', {});
        break;
      case 'prices':
        this.socket.emit('unsubscribe:prices', {});
        break;
    }
    
    this.subscriptions.delete(channel);
    this.logger.info(`Unsubscribed from ${channel}`);
  }
  
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
  
  send(event: string, data: any): void {
    if (!this.socket || !this.socket.connected) {
      this.logger.warn('Cannot send - not connected');
      return;
    }
    
    this.socket.emit(event, data);
  }
}