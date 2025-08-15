# Core Meme Platform - Quick Start Guide

## Prerequisites
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- Core testnet RPC access

## Environment Setup

1. **Copy environment template**
```bash
cp .env.example .env
```

2. **Set critical environment variables**
```bash
# Network configuration
NETWORK=testnet

# Core blockchain endpoints
CORE_TESTNET_RPC=https://rpc.test2.btcs.network
CORE_SCAN_TESTNET_API=https://api.test2.btcs.network/api
CORE_SCAN_API_KEY=your_api_key_here

# Database
POSTGRES_PASSWORD=your_secure_password

# Redis (uses defaults if not set)
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS origins
CORS_ORIGIN=http://localhost:3000,http://localhost:8080

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## Quick Start Commands

### 1. Start Infrastructure (Redis + PostgreSQL)
```bash
docker-compose up -d redis postgres
```

### 2. Deploy Smart Contracts (Testnet)
```bash
cd contracts
pnpm install
pnpm deploy:testnet

# Save the deployed factory address to .env
echo "MEME_FACTORY_ADDRESS=0x..." >> ../.env
```

### 3. Start API Service
```bash
# In a new terminal
cd backend/api
pnpm install
pnpm dev
# Runs on http://localhost:3001
```

### 4. Start WebSocket Server
```bash
# In a new terminal
cd backend/websocket
pnpm install
pnpm dev
# Runs on ws://localhost:8081
```

### 5. Start Telegram Bot (Optional)
```bash
# In a new terminal
cd telegram-bot
pnpm install
pnpm dev
```

### 6. Start Blockchain Monitor (Optional)
```bash
# In a new terminal
cd backend/blockchain-monitor
pnpm install
pnpm dev
```

## Testing the Setup

### Test API
```bash
# Health check
curl http://localhost:3001/health

# Get token info
curl http://localhost:3001/api/tokens/0x...

# Get Core price
curl http://localhost:3001/api/stats/price
```

### Test WebSocket
```bash
# Run integration test
node test-integration.js
```

### Test with wscat
```bash
npm install -g wscat
wscat -c ws://localhost:8080

# After connected, send:
{"type":"subscribe","channel":"alerts"}
{"type":"subscribe","channel":"new_token"}
{"type":"subscribe","channel":"price_update"}
```

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| Core API | 3001 | http://localhost:3001 |
| WebSocket | 8080 | ws://localhost:8080 |
| PostgreSQL | 5432 | postgresql://localhost:5432 |
| Redis | 6379 | redis://localhost:6379 |
| Telegram Bot | N/A | Connects to Telegram API |

## Common Issues & Solutions

### Issue: WebSocket not receiving messages
**Solution**: Make sure you're using the refactored server (check websocket/package.json points to index-refactored.ts)

### Issue: Database connection failed
**Solution**: Ensure PostgreSQL is running and credentials match in .env

### Issue: CORS errors
**Solution**: Set CORS_ORIGIN in .env to include your client URL

### Issue: Contract deployment fails
**Solution**: Check you have testnet CORE tokens and correct RPC endpoint

## Monitoring

### View Logs
```bash
# Docker services
docker-compose logs -f redis postgres

# Node services (in their respective directories)
# Logs are displayed in terminal when using pnpm dev
```

### Database Access
```bash
# Connect to PostgreSQL
docker exec -it core-meme-postgres psql -U core_user -d core_meme_platform

# Common queries
\dt  # List all tables
SELECT * FROM users LIMIT 10;
SELECT * FROM tokens WHERE is_launched = true;
SELECT * FROM price_alerts WHERE is_active = true;
```

### Redis Monitoring
```bash
# Connect to Redis CLI
docker exec -it core-meme-redis redis-cli

# Monitor real-time commands
MONITOR

# Check pub/sub channels
PUBSUB CHANNELS

# View keys
KEYS *
```

## Stopping Services

### Stop Docker services
```bash
docker-compose down
```

### Stop Node services
Press `Ctrl+C` in each terminal running a service

### Clean up
```bash
# Remove all data (WARNING: This deletes all database data)
docker-compose down -v

# Clean node modules and build artifacts
pnpm clean
```

## Next Steps

1. Configure Telegram bot with BotFather
2. Deploy contracts to mainnet (when ready)
3. Set up monitoring and alerts
4. Configure backup strategy
5. Review security settings in security.config.js

## Support

- Check `DEPLOYMENT.md` for production deployment
- Check `INTEGRATION.md` for service integration details
- Check individual service README files for specific configuration