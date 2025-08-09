# Core Meme Platform - Service Integration Guide

## Architecture Overview

The Core Meme Platform consists of three main services that work together to provide real-time blockchain monitoring and trading capabilities:

```
┌─────────────────────┐     Redis Pub/Sub      ┌──────────────────┐
│  Blockchain Monitor │ ──────────────────────> │ WebSocket Server │
│                     │                          │                  │
│  - DexMonitor       │                          │  - Subscriptions │
│  - TradeProcessor   │                          │  - Broadcasting  │
│  - TokenProcessor   │                          │  - Persistence   │
│  - AlertService     │                          │                  │
└─────────────────────┘                          └──────────────────┘
         │                                                │
         │ PostgreSQL                            WebSocket│
         ↓                                                ↓
┌─────────────────────┐                          ┌──────────────────┐
│     Database        │                          │  Telegram Bot    │
│                     │                          │                  │
│  - Tokens           │                          │  - Trading       │
│  - Trades           │                          │  - Alerts        │
│  - Alerts           │                          │  - Portfolio     │
│  - User Data        │                          │  - Copy Trading  │
└─────────────────────┘                          └──────────────────┘
```

## Service Components

### 1. Blockchain Monitor (`/backend/blockchain-monitor`)
- **Purpose**: Monitors Core blockchain for DEX events, token launches, and trades
- **Key Components**:
  - `DexMonitor`: Watches DEX factory and pair contracts
  - `TradeProcessor`: Processes and analyzes trade events
  - `TokenProcessor`: Handles new token launches
  - `AlertService`: Generates and distributes alerts
- **Database**: PostgreSQL (core_meme_platform)
- **Communication**: Publishes events to Redis channels

### 2. WebSocket Server (`/websocket`)
- **Purpose**: Provides real-time data streaming to clients
- **Key Features**:
  - Database-backed subscription management
  - Persistent connection handling
  - Channel-based event distribution
- **Database**: Shares PostgreSQL with blockchain-monitor
- **Communication**: 
  - Subscribes to Redis channels from blockchain-monitor
  - Broadcasts to connected WebSocket clients

### 3. Telegram Bot (`/telegram-bot`)
- **Purpose**: User interface for trading and monitoring
- **Key Features**:
  - BullX-style authentication
  - Full trading capabilities (buy, sell, snipe)
  - Real-time alerts and notifications
  - Portfolio tracking with custom images
  - Copy trading functionality
- **Communication**: 
  - Connects to WebSocket server for real-time data
  - Direct database access for user data

## Redis Channels

The services communicate through the following Redis channels:

### From Blockchain Monitor to WebSocket Server:
- `websocket:alerts` - Trading alerts (whale activity, large trades)
- `websocket:new_token` - New token launches
- `websocket:trade` - Individual trade events
- `websocket:price_update` - Token price updates

### From Blockchain Monitor to Telegram Bot:
- `telegram:alerts` - Urgent alerts for Telegram delivery

## Database Schema

All services share a PostgreSQL database with the following key tables:

### Core Tables:
- `tokens` - Token information and metadata
- `pairs` - DEX pair data
- `trades` - Trade history
- `alerts` - Alert history and configuration
- `token_analytics` - Price and volume metrics

### User Tables:
- `users` - User accounts and wallets
- `subscriptions` - User subscription tiers
- `positions` - User token positions
- `copy_trades` - Copy trading configuration

### WebSocket Tables:
- `websocket_subscriptions` - Active subscriptions
- `websocket_connections` - Connected clients

## Running the Services

### Prerequisites:
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Core RPC endpoint

### Environment Variables:

Create `.env` files in each service directory:

#### Blockchain Monitor (.env):
```bash
# Network
NETWORK=mainnet
RPC_URL=https://rpc.coredao.org

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# DEX Configuration
COREX_FACTORY=0x...
ICECREAM_FACTORY=0x...
SHADOWSWAP_FACTORY=0x...
```

#### WebSocket Server (.env):
```bash
# Server
WS_PORT=3003
NODE_ENV=development

# Database (same as blockchain-monitor)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_URL=redis://localhost:6379
```

#### Telegram Bot (.env):
```bash
# Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_USERNAME=CoreMemeBot

# WebSocket
WEBSOCKET_URL=ws://localhost:3003

# Database (same as other services)
DATABASE_URL=postgresql://core_user:core_secure_pass_2024@localhost:5432/core_meme_platform

# Encryption
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Core Network
CORE_RPC_URL=https://rpc.coredao.org
NETWORK_ID=1116

# DEX Routers
COREX_ROUTER=0x...
ICECREAM_ROUTER=0x...
SHADOWSWAP_ROUTER=0x...
```

### Starting Services:

1. **Start PostgreSQL and Redis:**
```bash
# Using Docker
docker-compose up -d postgres redis

# Or system services
sudo systemctl start postgresql redis
```

2. **Initialize Database:**
```bash
cd backend/blockchain-monitor
pnpm run db:migrate
```

3. **Start Blockchain Monitor:**
```bash
cd backend/blockchain-monitor
pnpm install
pnpm run dev
```

4. **Start WebSocket Server:**
```bash
cd websocket
pnpm install
pnpm run dev
```

5. **Start Telegram Bot:**
```bash
cd telegram-bot
pnpm install
pnpm run dev
```

## Testing Integration

Run the integration test to verify all services are connected:

```bash
node test-integration.js
```

This will:
1. Connect to the WebSocket server
2. Subscribe to all channels
3. Simulate events from blockchain-monitor
4. Verify event propagation

## Monitoring

### Health Checks:
- WebSocket Server: `http://localhost:3003/health`
- WebSocket Stats: `http://localhost:3003/stats`

### Logs:
- Blockchain Monitor: `blockchain-monitor.log`, `trade-processor.log`
- WebSocket Server: Console output
- Telegram Bot: Console output

### Redis Monitoring:
```bash
# Monitor all Redis activity
redis-cli monitor

# Check specific channels
redis-cli PUBSUB CHANNELS "websocket:*"
```

## Troubleshooting

### WebSocket Connection Issues:
1. Check WebSocket server is running: `curl http://localhost:3003/health`
2. Verify Redis is accessible: `redis-cli ping`
3. Check firewall rules for port 3003

### Missing Events:
1. Verify blockchain-monitor is processing blocks
2. Check Redis pub/sub: `redis-cli PUBSUB NUMSUB websocket:alerts`
3. Review WebSocket subscriptions in database

### Database Connection Issues:
1. Verify PostgreSQL is running
2. Check connection string in .env files
3. Ensure database exists: `psql -U core_user -d core_meme_platform`

## Production Deployment

### Recommended Setup:
1. Use PM2 or systemd for process management
2. Configure nginx for WebSocket proxy
3. Set up SSL/TLS for WebSocket connections
4. Use Redis Sentinel for high availability
5. Configure PostgreSQL replication
6. Set up monitoring with Prometheus/Grafana

### Security Considerations:
1. Use strong encryption keys
2. Implement rate limiting
3. Set up firewall rules
4. Use environment-specific configs
5. Enable audit logging
6. Regular security updates

## Support

For issues or questions:
- GitHub Issues: https://github.com/core-meme-platform/issues
- Documentation: https://docs.core-meme.io
- Discord: https://discord.gg/corememe