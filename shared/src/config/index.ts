import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface SharedDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface SharedRedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface NetworkConfig {
  mainnetRpc: string;
  testnetRpc: string;
  explorerApiMainnet: string;
  explorerApiTestnet: string;
  explorerApiKey?: string;
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: string;
  database: SharedDatabaseConfig;
  redis: SharedRedisConfig;
  network: NetworkConfig;
  jwtSecret: string;
  signatureSecret: string;
  telegramBotToken?: string;
  frontendUrl: string;
}

export function getConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Validate required environment variables
  const requiredVars = ['JWT_SECRET', 'SIGNATURE_SECRET'];
  for (const varName of requiredVars) {
    if (!process.env[varName] && nodeEnv === 'production') {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }

  return {
    nodeEnv,
    logLevel: process.env.LOG_LEVEL || 'info',
    
    database: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'core_meme_platform',
      user: process.env.POSTGRES_USER || 'core_user',
      password: process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
    },
    
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
    
    network: {
      mainnetRpc: process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org',
      testnetRpc: process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network',
      explorerApiMainnet: process.env.CORE_SCAN_MAINNET_API || 'https://openapi.coredao.org/api',
      explorerApiTestnet: process.env.CORE_SCAN_TESTNET_API || 'https://api.test2.btcs.network/api',
      explorerApiKey: process.env.CORE_SCAN_API_KEY,
    },
    
    jwtSecret: process.env.JWT_SECRET || 'default_jwt_secret_dev_only',
    signatureSecret: process.env.SIGNATURE_SECRET || 'default_signature_secret_dev_only',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  };
}

export const config = getConfig();