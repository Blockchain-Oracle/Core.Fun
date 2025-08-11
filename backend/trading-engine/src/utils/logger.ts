import { createLogger } from '@core-meme/shared';

export const logger = createLogger({ 
  service: 'trading-engine',
  enableFileLogging: process.env.NODE_ENV === 'production'
});