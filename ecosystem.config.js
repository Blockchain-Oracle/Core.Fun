// PM2 Configuration for Core Meme Platform
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'api-gateway',
      cwd: './backend/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    },
    {
      name: 'websocket-server',
      cwd: './backend/websocket',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 8081
      },
      error_file: './logs/websocket-error.log',
      out_file: './logs/websocket-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'blockchain-monitor',
      cwd: './backend/blockchain-monitor',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/monitor-error.log',
      out_file: './logs/monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      cron_restart: '0 */6 * * *' // Restart every 6 hours
    },
    {
      name: 'telegram-bot',
      cwd: './telegram-bot',
      script: 'dist/bot.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/telegram-error.log',
      out_file: './logs/telegram-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      kill_timeout: 5000
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/core-meme-platform.git',
      path: '/var/www/core-meme-platform',
      'pre-deploy-local': '',
      'post-deploy': 'pnpm install && pnpm build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    },
    staging: {
      user: 'deploy',
      host: 'staging.your-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/core-meme-platform.git',
      path: '/var/www/core-meme-platform-staging',
      'post-deploy': 'pnpm install && pnpm build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};