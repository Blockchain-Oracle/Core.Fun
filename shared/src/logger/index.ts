import winston from 'winston';
import path from 'path';

export interface LoggerConfig {
  service: string;
  level?: string;
  logDir?: string;
  enableFileLogging?: boolean;
  maxFileSize?: number;
  maxFiles?: number;
}

export function createLogger(config: LoggerConfig): winston.Logger {
  const {
    service,
    level = process.env.LOG_LEVEL || 'info',
    logDir = path.join(process.cwd(), 'logs'),
    enableFileLogging = true,
    maxFileSize = 5242880, // 5MB
    maxFiles = 5,
  } = config;

  // Base log format
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  );

  // Console format for development
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let log = `${timestamp} [${level}]: ${message}`;
      
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta, null, 2)}`;
      }
      
      return log;
    })
  );

  const transports: winston.transport[] = [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    }),
  ];

  // Add file transports if enabled
  if (enableFileLogging) {
    transports.push(
      // Error logs
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: maxFileSize,
        maxFiles,
      }),
      // All logs
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: maxFileSize,
        maxFiles,
      })
    );
  }

  return winston.createLogger({
    level,
    format: logFormat,
    defaultMeta: { service },
    transports,
  });
}

// Create HTTP stream for Morgan
export function createHttpStream(logger: winston.Logger) {
  return {
    write: (message: string) => {
      logger.info(message.trim());
    },
  };
}

// Pre-configured loggers for each service
export const apiLogger = createLogger({ service: 'api', enableFileLogging: false });
export const telegramLogger = createLogger({ service: 'telegram-bot' });
export const websocketLogger = createLogger({ service: 'websocket-server' });
export const blockchainLogger = createLogger({ service: 'blockchain-monitor' });