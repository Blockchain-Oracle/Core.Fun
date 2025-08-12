import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { createLogger } from '@core-meme/shared';

interface Alert {
  id: string;
  type: 'price' | 'volume' | 'liquidity' | 'whale' | 'rug';
  tokenAddress: string;
  tokenSymbol: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  data: any;
  timestamp: number;
}

export class AlertStreamHandler {
  private redis: Redis;
  private subscriptions: Map<string, Set<string>> = new Map(); // clientId -> alert types
  private alertQueue: Alert[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private logger = createLogger({ service: 'websocket-alerts' });

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async start(): Promise<void> {
    this.logger.info('Starting alert stream handler');
    
    // Start processing alerts
    this.startProcessing();
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping alert stream handler');
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  async subscribe(clientId: string, params: any): Promise<void> {
    const { types } = params;
    
    if (!Array.isArray(types)) {
      throw new Error('Invalid subscription params: types must be an array');
    }
    
    // Store subscription
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    
    types.forEach((type: string) => {
      this.subscriptions.get(clientId)!.add(type);
    });
  }

  async unsubscribe(clientId: string): Promise<void> {
    this.subscriptions.delete(clientId);
  }

  private startProcessing(): void {
    // Process alerts every second
    this.processingInterval = setInterval(() => {
      this.processAlerts();
    }, 1000);
  }

  private processAlerts(): void {
    while (this.alertQueue.length > 0) {
      const alert = this.alertQueue.shift()!;
      this.broadcastAlert(alert);
    }
  }

  public createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): void {
    const fullAlert: Alert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: Date.now(),
    };
    
    this.alertQueue.push(fullAlert);
    this.logger.info(`Alert created: ${fullAlert.type} - ${fullAlert.title}`);
  }

  private broadcastAlert(alert: Alert): void {
    // Find all clients subscribed to this alert type
    const interestedClients: string[] = [];
    
    this.subscriptions.forEach((types, clientId) => {
      if (types.has(alert.type) || types.has('*')) {
        interestedClients.push(clientId);
      }
    });
    
    // Broadcast to interested clients
    interestedClients.forEach(clientId => {
      this.redis.publish('websocket:alerts', JSON.stringify({
        clientId,
        alerts: [alert],
      }));
    });
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${randomUUID()}`;
  }

  // Public methods for generating specific alerts
  public priceAlert(
    tokenAddress: string,
    tokenSymbol: string,
    currentPrice: number,
    targetPrice: number,
    direction: 'above' | 'below'
  ): void {
    this.createAlert({
      type: 'price',
      tokenAddress,
      tokenSymbol,
      title: `Price Alert: ${tokenSymbol}`,
      message: `${tokenSymbol} price ${direction} target: $${currentPrice.toFixed(6)} (target: $${targetPrice.toFixed(6)})`,
      severity: 'info',
      data: { currentPrice, targetPrice, direction },
    });
  }

  public volumeAlert(
    tokenAddress: string,
    tokenSymbol: string,
    volume24h: number,
    threshold: number
  ): void {
    this.createAlert({
      type: 'volume',
      tokenAddress,
      tokenSymbol,
      title: `Volume Spike: ${tokenSymbol}`,
      message: `${tokenSymbol} 24h volume: $${(volume24h / 1000000).toFixed(2)}M`,
      severity: volume24h > threshold * 2 ? 'warning' : 'info',
      data: { volume24h, threshold },
    });
  }

  public whaleAlert(
    tokenAddress: string,
    tokenSymbol: string,
    walletAddress: string,
    action: 'buy' | 'sell',
    amount: number,
    value: number
  ): void {
    this.createAlert({
      type: 'whale',
      tokenAddress,
      tokenSymbol,
      title: `Whale Alert: ${tokenSymbol}`,
      message: `Whale ${action}: $${(value / 1000000).toFixed(2)}M of ${tokenSymbol}`,
      severity: value > 1000000 ? 'critical' : 'warning',
      data: { walletAddress, action, amount, value },
    });
  }

  public rugAlert(
    tokenAddress: string,
    tokenSymbol: string,
    reason: string,
    rugScore: number
  ): void {
    this.createAlert({
      type: 'rug',
      tokenAddress,
      tokenSymbol,
      title: `⚠️ Rug Alert: ${tokenSymbol}`,
      message: `Potential rug detected: ${reason}`,
      severity: 'critical',
      data: { reason, rugScore },
    });
  }
}