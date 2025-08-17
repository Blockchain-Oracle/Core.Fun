# Coolify Deployment Guide for Core Meme Platform

## Overview
This guide covers deploying the Core Meme Platform as a **single Coolify application** with all 5 services running together using PM2.

## Services Deployed
- **Frontend** (Next.js) - Port 3000
- **API Server** (Express.js) - Port 3001  
- **WebSocket Server** - Port 8081
- **Blockchain Monitor** - Port 3003
- **Telegram Bot** - Port 3004

## Coolify Configuration

### 1. Application Setup
- **Repository**: Your Git repository URL
- **Branch**: `main` (or your preferred branch)
- **Base Directory**: `/` (root of monorepo)
- **Build Pack**: Nixpacks
- **Exposed Ports**: `3000,3001,3003,3004,8081`

### 2. Environment Variables

#### Required Database Variables
```bash
# PostgreSQL Database
DATABASE_URL=postgresql://username:password@host:5432/database_name
POSTGRES_HOST=your-postgres-host
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=your-db-user
POSTGRES_PASSWORD=your-db-password

# Redis
REDIS_URL=redis://username:password@host:6379
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
```

#### Blockchain Configuration
```bash
# Core Blockchain RPC
CORE_RPC_URL=https://1114.rpc.thirdweb.com
CORE_CHAIN_ID=1114

# Contract Addresses (update with your deployed contracts)
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784
STAKING_ADDRESS=0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa
STAKING_TOKEN_ADDRESS=0x26EfC13dF039c6B4E084CEf627a47c348197b655
STAKING_TOKEN_SYMBOL=CMP

# Private Keys (for transaction signing)
PRIVATE_KEY=your-private-key-for-contract-interactions
WALLET_ENCRYPTION_KEY=your-encryption-key-for-user-wallets
```

#### API Configuration
```bash
# JWT and Authentication
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_EXPIRES_IN=7d
ADMIN_API_KEY=your-admin-api-key

# CORS Origins (update with your domain)
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Telegram Bot Configuration
```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_ADMIN_CHAT_ID=your-admin-chat-id

# Bot Features
ENABLE_COPY_TRADING=true
ENABLE_PRICE_ALERTS=true
MAX_POSITION_SIZE=1000
```

#### WebSocket Configuration
```bash
# WebSocket Server
WS_PORT=8081
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CONNECTIONS=1000

# CORS for WebSocket
WS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

#### Frontend Configuration (Next.js)
```bash
# Public Variables (accessible in browser)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com
NEXT_PUBLIC_CHAIN_ID=1114
NEXT_PUBLIC_MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Private Variables (server-side only)
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=https://yourdomain.com
```

#### Optional Monitoring & Analytics
```bash
# Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# Monitoring
SENTRY_DSN=your-sentry-dsn
ANALYTICS_API_KEY=your-analytics-api-key

# Performance
NODE_OPTIONS=--max-old-space-size=4096
```

### 3. Port Configuration

In Coolify, configure the following port mappings:

| Service | Internal Port | External Access |
|---------|---------------|-----------------|
| Frontend | 3000 | Main domain (yourdomain.com) |
| API | 3001 | Subdomain (api.yourdomain.com) |
| WebSocket | 8081 | Subdomain (ws.yourdomain.com) |
| Monitor | 3003 | Internal only |
| Telegram Bot | 3004 | Internal only |

### 4. Domain Configuration

Configure these domains in Coolify:

1. **Main App**: `yourdomain.com` → Port 3000 (Frontend)
2. **API**: `api.yourdomain.com` → Port 3001 (API Server)  
3. **WebSocket**: `ws.yourdomain.com` → Port 8081 (WebSocket)

### 5. Health Checks

Add these health check endpoints to monitor service status:

- **Frontend**: `GET /api/health`
- **API**: `GET /health`
- **WebSocket**: `GET /health`
- **Monitor**: `GET /health`
- **Bot**: PM2 process monitoring

### 6. Deployment Steps

1. **Create Application** in Coolify
2. **Connect Repository** and select branch
3. **Set Environment Variables** (all variables above)
4. **Configure Ports** (3000,3001,3003,3004,8081)
5. **Set Domain Mappings** for each service
6. **Deploy** - Nixpacks will handle the build automatically

### 7. Post-Deployment Verification

Check that all services are running:

```bash
# Access the Coolify terminal and run:
pm2 list

# Should show all 5 services running:
# - frontend
# - api-server  
# - websocket-server
# - blockchain-monitor
# - telegram-bot
```

### 8. Monitoring & Logs

Access logs through:
- **Coolify Dashboard** - Real-time logs
- **PM2 Monitoring**: `pm2 monit` in terminal
- **Application Logs**: Check `/logs/` directory

### 9. Scaling Considerations

For high traffic, consider:
- Increasing API instances in ecosystem.config.js
- Using Coolify's horizontal scaling features
- Setting up database read replicas
- Implementing Redis clustering

### 10. Troubleshooting

Common issues:
- **Build failures**: Check nixpacks.toml configuration
- **Service crashes**: Check PM2 logs and environment variables
- **Port conflicts**: Ensure unique ports for each service
- **Database connections**: Verify DATABASE_URL and connection strings

## Security Notes

- Use strong, unique passwords for all services
- Enable SSL/TLS for all domains
- Keep private keys and secrets secure
- Regularly update dependencies
- Monitor for security alerts

## Backup Strategy

- Database: Daily automated backups
- Code: Git repository with proper branching
- Environment: Document all configuration changes
- Logs: Retain for compliance and debugging

This deployment configuration provides a production-ready setup for your Core Meme Platform on Coolify.