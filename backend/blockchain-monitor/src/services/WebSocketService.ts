import { createLogger } from '@core-meme/shared';
import { io, Socket } from 'socket.io-client';

export class WebSocketService {
  private socket: Socket | null = null;
  private logger = createLogger({ service: 'websocket-service' });
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(private wsUrl?: string) {
    this.wsUrl = wsUrl || process.env.WEBSOCKET_URL || 'http://localhost:8081';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Connecting to WebSocket server at ${this.wsUrl}`);
      
      this.socket = io(this.wsUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.socket.on('connect', () => {
        this.logger.info('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        this.logger.warn(`WebSocket disconnected: ${reason}`);
      });

      this.socket.on('connect_error', (error) => {
        this.logger.error('WebSocket connection error:', error.message);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to WebSocket server'));
        }
      });

      this.socket.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
      });

      // Set a timeout for initial connection
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  async emit(event: string, data: any): Promise<void> {
    if (!this.socket?.connected) {
      this.logger.warn('WebSocket not connected, attempting to reconnect...');
      await this.connect();
    }
    
    this.socket?.emit(event, data);
  }

  on(event: string, callback: (data: any) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (data: any) => void): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  async publishTokenUpdate(tokenAddress: string, data: any): Promise<void> {
    await this.emit('token:update', {
      address: tokenAddress,
      ...data
    });
  }

  async publishTradeEvent(data: any): Promise<void> {
    await this.emit('trade:new', data);
  }

  async publishPriceUpdate(tokenAddress: string, price: number): Promise<void> {
    await this.emit('price:update', {
      address: tokenAddress,
      price,
      timestamp: Date.now()
    });
  }

  async publishAlert(userId: string, alert: any): Promise<void> {
    await this.emit('alert:triggered', {
      userId,
      alert,
      timestamp: Date.now()
    });
  }

  async subscribe(channel: string): Promise<void> {
    await this.emit('subscribe', { channel });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.emit('unsubscribe', { channel });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  close(): void {
    this.disconnect();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}