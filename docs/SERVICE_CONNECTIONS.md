# 🔗 Service Connections & Integration Guide

This document details how all services in the Core Meme Platform connect and communicate with each other.

## Service Map

```
┌────────────────────────────────────────────────────────────────┐
│                         Frontend (Web App)                      │
│                                                                  │
│  Connects to:                                                   │
│  • API Service (REST) - http://localhost:3001                   │
│  • WebSocket Server - ws://localhost:8081                       │
│  • Wallet (MetaMask/WalletConnect)                             │
└────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│      API Service            │   │     WebSocket Server         │
│      Port: 3001             │◄──│        Port: 8081           │
│                             │   │                              │
│ • REST API endpoints        │   │ • Real-time price updates    │
│ • Authentication            │   │ • Live trade streams         │
│ • Token trading             │   │ • Alert notifications        │
│ • Wallet management         │   │ • New token events           │
└─────────────────────────────┘   └──────────────────────────────┘
         │         │                        │         │
         ▼         ▼                        ▼         ▼
┌──────────────────────────────────────────────────────────────┐
│                     Shared Infrastructure                     │
│                                                               │
│  ┌─────────────────┐        ┌──────────────────┐            │
│  │   PostgreSQL    │        │      Redis       │            │
│  │   Port: 5432    │        │    Port: 6379    │            │
│  └─────────────────┘        └──────────────────┘            │
└──────────────────────────────────────────────────────────────┘
         ▲         ▲                    ▲         ▲
         │         │                    │         │
┌────────┴───────┐ │              ┌────┴──────┐  │
│Blockchain      │ │              │Telegram   │  │
│Monitor         │ │              │Bot        │  │
│Port: 3003      │ │              │Port: 3004 │  │
└────────────────┘ │              └───────────┘  │
                   │                              │
                   └──────────────────────────────┘
```

## Connection Details

### 1. PostgreSQL Database (Port 5432)

**All services connect for:**
- User data storage
- Token information
- Trade history
- Positions tracking
- Alert configurations
- Price history

**Connection String:**
```
postgresql://core_user:password@localhost:5432/core_meme_platform
```

**Services that connect:**
- ✅ API Service
- ✅ WebSocket Server
- ✅ Blockchain Monitor
- ✅ Telegram Bot

### 2. Redis Cache (Port 6379)

**Used for:**
- Session management
- Real-time data caching
- Pub/Sub messaging
- Rate limiting
- Temporary data storage
- Wallet encryption keys

**Connection String:**
```
redis://localhost:6379
```

**Services that connect:**
- ✅ API Service
- ✅ WebSocket Server
- ✅ Blockchain Monitor
- ✅ Telegram Bot

### 3. WebSocket Server (Port 8081)

**Provides real-time updates for:**
- Token price changes
- New token launches
- Trade executions
- Bonding curve updates
- Alert triggers

**Clients that connect:**
- Frontend Web App
- Telegram Bot

**Event Types:**
```javascript
// Subscribe to events
socket.emit('subscribe', { 
  events: ['price', 'trades', 'newTokens'] 
});

// Receive updates
socket.on('price:update', (data) => { ... });
socket.on('trade:new', (data) => { ... });
socket.on('token:created', (data) => { ... });
```

### 4. API Service (Port 3001)

**Main backend service handling:**
- User authentication (Telegram OAuth)
- Token creation through MemeFactory
- Buy/sell trades on bonding curves
- Wallet management (custodial)
- Transaction history
- Portfolio tracking

**Endpoints:**
```
POST /api/auth/telegram        - Telegram login
GET  /api/tokens               - List all tokens
POST /api/tokens/create        - Create new token
POST /api/tokens/:address/buy  - Buy tokens
POST /api/tokens/:address/sell - Sell tokens
GET  /api/wallet/info          - Wallet balance
```

### 5. Blockchain Monitor (Port 3003)

**Monitors MemeFactory events:**
- TokenCreated
- TokenPurchased  
- TokenSold
- TokenLaunched (graduated to DEX)
- PlatformFeeUpdated

**Publishes to Redis channels:**
```
websocket:new_token    - New token created
websocket:trade        - Trade executed
websocket:price_update - Price changed
websocket:alerts       - Alert triggered
```

### 6. Telegram Bot (Port 3004)

**Provides trading interface via Telegram:**
- Wallet creation and management
- Token trading commands
- Portfolio tracking
- Price alerts
- Copy trading

**Connects to:**
- API Service (HTTP) - For trades and data
- WebSocket Server - For real-time updates
- PostgreSQL - For user data
- Redis - For session management

## Data Flow Examples

### Token Purchase Flow
```
1. User initiates buy via Frontend/Telegram
2. Request sent to API Service
3. API Service decrypts user wallet
4. Transaction sent to MemeFactory contract
5. Blockchain Monitor detects TokenPurchased event
6. Event published to Redis
7. WebSocket Server broadcasts to connected clients
8. Frontend/Telegram updates UI
```

### Price Update Flow
```
1. Blockchain Monitor detects trade event
2. Calculates new price from bonding curve
3. Publishes to Redis channel
4. WebSocket Server receives update
5. Broadcasts to subscribed clients
6. Frontend updates price display
```

## Service Dependencies

| Service | Depends On | Required For |
|---------|-----------|--------------|
| API Service | PostgreSQL, Redis, Blockchain | Core functionality |
| WebSocket Server | Redis, PostgreSQL | Real-time updates |
| Blockchain Monitor | PostgreSQL, Redis, Core RPC | Event monitoring |
| Telegram Bot | API Service, WebSocket, PostgreSQL, Redis | Telegram interface |

## Environment Variables

Each service requires specific environment variables:

### Common (All Services)
```env
NODE_ENV=production
NETWORK=testnet
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

### Service-Specific
```env
# API Service
JWT_SECRET=...
ENCRYPTION_SECRET=...

# WebSocket
WS_PORT=8081
CORS_ORIGINS=...

# Telegram Bot
TELEGRAM_BOT_TOKEN=...
API_URL=http://localhost:3001

# Blockchain Monitor
START_BLOCK=0
CONFIRMATIONS=3
```

## Health Checks

Each service exposes health endpoints:

- API Service: `GET http://localhost:3001/health`
- WebSocket: `GET http://localhost:8081/health`
- Blockchain Monitor: `GET http://localhost:3003/health`
- Telegram Bot: `GET http://localhost:3004/health`

## Troubleshooting

### Connection Issues

1. **PostgreSQL Connection Failed**
   - Check if PostgreSQL is running: `docker-compose ps postgres`
   - Verify credentials in `.env`
   - Check network connectivity

2. **Redis Connection Failed**
   - Check if Redis is running: `docker-compose ps redis`
   - Test connection: `redis-cli ping`

3. **WebSocket Not Connecting**
   - Check CORS settings
   - Verify port 8081 is not blocked
   - Check firewall rules

4. **Blockchain Monitor Not Syncing**
   - Verify RPC URL is accessible
   - Check contract address is correct
   - Review logs for specific errors

## Monitoring

Use these commands to monitor services:

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f api

# Check service status
docker-compose ps

# Monitor Redis
redis-cli monitor

# Check PostgreSQL connections
docker exec -it core-meme-postgres psql -U core_user -c "SELECT * FROM pg_stat_activity;"
```