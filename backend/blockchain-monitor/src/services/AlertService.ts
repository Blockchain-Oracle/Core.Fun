import winston from 'winston';
import { Alert } from '../types';
import { DatabaseService } from './DatabaseService';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'eventemitter3';

export class AlertService extends EventEmitter {
  private db: DatabaseService;
  private redis: RedisClientType;
  private logger: winston.Logger;
  private alertSubscribers: Set<string> = new Set();

  constructor(db: DatabaseService) {
    super();
    this.db = db;
    
    // Initialize logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: 'alerts.log' 
        }),
      ],
    });
    
    // Initialize Redis
    this.redis = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });
    
    this.redis.connect().catch(err => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async sendAlert(alert: Alert): Promise<void> {
    try {
      // Save to database
      await this.db.saveAlert(alert);
      
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
      await this.redis.lPush('telegram:alerts', JSON.stringify({
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
        await this.redis.lPush('webhooks:queue', JSON.stringify({
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
    // Log critical alerts to a separate file
    const criticalLogger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: 'critical-alerts.log' 
        }),
      ],
    });
    
    criticalLogger.error('CRITICAL ALERT', alert);
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
    return await this.db.getUnsentAlerts();
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}