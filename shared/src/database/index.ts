import { Pool, PoolConfig } from 'pg';
import knex, { Knex } from 'knex';

export * from './types';

export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export function createPostgresPool(config?: DatabaseConfig): Pool {
  const poolConfig: PoolConfig = {
    host: config?.host || process.env.POSTGRES_HOST || 'postgres',
    port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
    database: config?.database || process.env.POSTGRES_DB || 'core_meme_platform',
    user: config?.user || process.env.POSTGRES_USER || 'core_user',
    password: config?.password || process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
  
  return new Pool(poolConfig);
}

export function createKnexConnection(config?: DatabaseConfig): Knex {
  const knexConfig: Knex.Config = {
    client: 'pg',
    connection: {
      host: config?.host || process.env.POSTGRES_HOST || 'postgres',
      port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
      database: config?.database || process.env.POSTGRES_DB || 'core_meme_platform',
      user: config?.user || process.env.POSTGRES_USER || 'core_user',
      password: config?.password || process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: 'knex_migrations',
    },
  };
  
  return knex(knexConfig);
}

export * from './types';