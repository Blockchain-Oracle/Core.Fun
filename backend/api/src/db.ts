import knex from 'knex';

const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'core_user',
    password: process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
    database: process.env.POSTGRES_DB || 'core_meme_platform'
  },
  pool: {
    min: 2,
    max: 10
  }
});

export { db };