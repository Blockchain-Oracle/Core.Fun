import { DatabaseService } from '@core-meme/shared';
import { Alert } from '../types';
import { EventEmitter } from 'eventemitter3';
import { createRedisClient, createLogger } from '@core-meme/shared';
import Redis from 'ioredis';

export class AlertService extends EventEmitter {
  private db: DatabaseService;
  private redis: Redis;
  private logger = createLogger({ service: 'alert-service' });
  private alertSubscribers: Set<string> = new Set();

  constructor(db: DatabaseService) {
    super();
    this.db = db;
    
    // Initialize Redis
    this.redis = createRedisClient();
  }

  private mapAlertType(type: string): 'price_above' | 'price_below' | 'volume_spike' | 'new_token' | 'rug_warning' {
    const typeMap: Record<string, 'price_above' | 'price_below' | 'volume_spike' | 'new_token' | 'rug_warning'> = {
      'NEW_TOKEN': 'new_token',
      'NEW_PAIR': 'new_token',
      'LARGE_BUY': 'volume_spike',
      'LARGE_SELL': 'volume_spike',
      'LIQUIDITY_ADDED': 'volume_spike',
      'LIQUIDITY_REMOVED': 'rug_warning',
      'RUG_WARNING': 'rug_warning',
      'HONEYPOT_DETECTED': 'rug_warning',
      'WHALE_ACTIVITY': 'volume_spike'
    };
    
    return typeMap[type] || 'new_token';
  }

  async sendAlert(alert: Alert): Promise<void> {
    try {
      // Convert blockchain alert to database alert format
      const dbAlert = {
        id: alert.id,
        userId: 'system', // System-generated alerts
        tokenAddress: alert.tokenAddress,
        type: this.mapAlertType(alert.type),
        condition: { 
          severity: alert.severity,
          message: alert.message,
          data: alert.data 
        },
        triggered: false,
        createdAt: new Date(alert.timestamp)
      };
      
      // Save to database
      await this.db.saveAlert(dbAlert);
      
      // Publish to Redis for real-time subscribers
      await this.redis.publish('alerts', JSON.stringify(alert));
      
      // Emit event for local listeners
      this.emit('alert', alert);
      
      // Send to different channels based on severity
      switch (alert.severity) {
        case 'CRITICAL':
          await this.sendCriticalAlert(alert);
          break;
        case 'HIGH':
          await this.sendHighPriorityAlert(alert);
          break;
        case 'MEDIUM':
          await this.sendMediumPriorityAlert(alert);
          break;
        case 'LOW':
          await this.sendLowPriorityAlert(alert);
          break;
      }
      
      // Mark as sent
      await this.db.markAlertSent(alert.id);
      
      this.logger.info(`Alert sent: ${alert.type} - ${alert.message}`);
    } catch (error) {
      this.logger.error('Error sending alert:', error);
      throw error;
    }
  }

  private async sendCriticalAlert(alert: Alert): Promise<void> {
    // Critical alerts go to all channels immediately
    await Promise.all([
      this.sendToTelegram(alert, true),
      this.sendToWebSocket(alert),
      this.sendToWebhook(alert),
      this.logCriticalAlert(alert),
    ]);
  }

  private async sendHighPriorityAlert(alert: Alert): Promise<void> {
    // High priority alerts go to premium subscribers
    await Promise.all([
      this.sendToTelegram(alert, false),
      this.sendToWebSocket(alert),
      this.sendToWebhook(alert),
    ]);
  }

  private async sendMediumPriorityAlert(alert: Alert): Promise<void> {
    // Medium priority alerts go to WebSocket and webhooks
    await Promise.all([
      this.sendToWebSocket(alert),
      this.sendToWebhook(alert),
    ]);
  }

  private async sendLowPriorityAlert(alert: Alert): Promise<void> {
    // Low priority alerts just go to WebSocket
    await this.sendToWebSocket(alert);
  }

  private async sendToTelegram(alert: Alert, urgent: boolean): Promise<void> {
    try {
      // Format message for Telegram
      const message = this.formatTelegramMessage(alert);
      
      // Publish to Telegram bot queue
      await this.redis.lpush('telegram:alerts', JSON.stringify({
        message,
        urgent,
        alert,
      }));
      
      this.logger.debug(`Alert queued for Telegram: ${alert.id}`);
    } catch (error) {
      this.logger.error('Error sending to Telegram:', error);
    }
  }

  private async sendToWebSocket(alert: Alert): Promise<void> {
    try {
      // Publish to WebSocket channel
      await this.redis.publish('websocket:alerts', JSON.stringify(alert));
      
      this.logger.debug(`Alert published to WebSocket: ${alert.id}`);
    } catch (error) {
      this.logger.error('Error sending to WebSocket:', error);
    }
  }

  private async sendToWebhook(alert: Alert): Promise<void> {
    try {
      // Get webhook URLs from environment or database
      const webhookUrls = process.env.WEBHOOK_URLS?.split(',') || [];
      
      for (const url of webhookUrls) {
        // Queue webhook delivery
        await this.redis.lpush('webhooks:queue', JSON.stringify({
          url,
          payload: alert,
          retries: 0,
        }));
      }
      
      this.logger.debug(`Alert queued for webhooks: ${alert.id}`);
    } catch (error) {
      this.logger.error('Error sending to webhooks:', error);
    }
  }

  private async logCriticalAlert(alert: Alert): Promise<void> {
    // Log critical alerts to a separate file using the shared logger
    this.logger.error('CRITICAL ALERT', alert);
  }

  private formatTelegramMessage(alert: Alert): string {
    let emoji = '';
    switch (alert.type) {
      case 'NEW_TOKEN':
        emoji = '🆕';
        break;
      case 'NEW_PAIR':
        emoji = '💱';
        break;
      case 'LARGE_BUY':
        emoji = '🟢';
        break;
      case 'LARGE_SELL':
        emoji = '🔴';
        break;
      case 'LIQUIDITY_ADDED':
        emoji = '💧';
        break;
      case 'LIQUIDITY_REMOVED':
        emoji = '🏃';
        break;
      case 'RUG_WARNING':
        emoji = '⚠️';
        break;
      case 'HONEYPOT_DETECTED':
        emoji = '🍯';
        break;
      case 'WHALE_ACTIVITY':
        emoji = '🐋';
        break;
    }
    
    let severity = '';
    switch (alert.severity) {
      case 'CRITICAL':
        severity = '🚨 CRITICAL';
        break;
      case 'HIGH':
        severity = '⚠️ HIGH';
        break;
      case 'MEDIUM':
        severity = '📢 MEDIUM';
        break;
      case 'LOW':
        severity = 'ℹ️ LOW';
        break;
    }
    
    return `${emoji} ${severity}\n\n${alert.message}\n\nToken: ${alert.tokenAddress}`;
  }

  async subscribeToAlerts(userId: string): Promise<void> {
    this.alertSubscribers.add(userId);
    this.logger.info(`User ${userId} subscribed to alerts`);
  }

  async unsubscribeFromAlerts(userId: string): Promise<void> {
    this.alertSubscribers.delete(userId);
    this.logger.info(`User ${userId} unsubscribed from alerts`);
  }

  async getRecentAlerts(limit: number = 50): Promise<Alert[]> {
    // TODO: Implement getUnsentAlerts in DatabaseService
    return [];
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}