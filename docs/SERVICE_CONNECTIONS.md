# 🔗 Service Connections & Integration Guide

This document details how all services in the Core Meme Platform connect and communicate with each other.

## Service Map

```
┌────────────────────────────────────────────────────────────────┐
│                         Frontend (Web App)                      │
│                                                                  │
│  Connects to:                                                   │
│  • API Gateway (REST) - http://localhost:3001                   │
│  • WebSocket Server - ws://localhost:8081                       │
│  • Wallet (MetaMask/WalletConnect)                             │
└────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│      API Gateway            │   │     WebSocket Server         │
│      Port: 3001             │◄──│        Port: 8081           │
│                             │   │                              │
│ • REST API endpoints        │   │ • Real-time price updates    │
│ • Authentication            │   │ • Live trade streams         │
│ • Rate limiting             │   │ • Alert notifications        │
│ • Request routing           │   │ • New token events           │
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
         ▲         ▲         ▲         ▲         ▲
         │         │         │         │         │
┌────────┴──┐ ┌───┴────┐ ┌──┴────┐ ┌──┴──────┐ ┌┴──────────┐
│Blockchain │ │Trading │ │Core   │ │Telegram │ │Analytics  │
│Monitor    │ │Engine  │ │API    │ │Bot      │ │Service    │
└───────────┘ └────────┘ └───────┘ └─────────┘ └───────────┘
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
- ✅ API Gateway
- ✅ WebSocket Server
- ✅ Trading Engine
- ✅ Blockchain Monitor
- ✅ Telegram Bot
- ✅ Core API Service

### 2. Redis Cache (Port 6379)

**Used for:**
- Session management
- Real-time data caching
- Pub/Sub messaging
- Rate limiting
- Temporary data storage

**Connection String:**
```
redis://localhost:6379
```

**Pub/Sub Channels:**
```javascript
// Price updates
'price:update:TOKEN_ADDRESS'

// New tokens
'token:new'

// Trade events
'trade:TOKEN_ADDRESS'

// Alerts
'alert:USER_ID'

// System events
'system:maintenance'
'system:update'
```

### 3. API Gateway (Port 3001)

**Main REST API hub that routes requests to appropriate services.**

**External Endpoints:**
```
GET  /health                    # Health check
GET  /api/tokens                # List all tokens
GET  /api/tokens/:address       # Get token details
GET  /api/prices/:address       # Get token price
POST /api/tokens/create         # Create new token
POST /api/trade/buy             # Execute buy
POST /api/trade/sell            # Execute sell
GET  /api/user/portfolio        # Get portfolio
POST /api/alerts               # Create alert
```

**Internal Communication:**
```javascript
// Calls Trading Engine
await fetch('http://localhost:3003/api/trade/execute', {
  headers: { 'X-Internal-Key': INTERNAL_API_KEY }
});

// Calls Core API Service
await fetch('http://localhost:3001/api/blockchain/info');

// Publishes to Redis
redis.publish('price:update:TOKEN', priceData);
```

### 4. WebSocket Server (Port 8081)

**Real-time bidirectional communication.**

**Client Connection:**
```javascript
const ws = new WebSocket('ws://localhost:8081');

// Authentication
ws.send(JSON.stringify({
  type: 'auth',
  token: 'JWT_TOKEN'
}));

// Subscribe to channels
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'price:0x123...',
  params: { interval: 1000 }
}));
```

**Channels:**
```javascript
// Price updates
{
  type: 'price',
  channel: 'price:TOKEN_ADDRESS',
  data: {
    price: 0.001,
    change24h: 15.5,
    volume: 100000,
    timestamp: Date.now()
  }
}

// New token alerts
{
  type: 'new_token',
  data: {
    address: '0x...',
    name: 'Token Name',
    symbol: 'TKN',
    initialPrice: 0.0001
  }
}

// Trade events
{
  type: 'trade',
  channel: 'trades:TOKEN_ADDRESS',
  data: {
    type: 'buy',
    amount: 1000,
    price: 0.001,
    trader: '0x...',
    txHash: '0x...'
  }
}
```

### 5. Trading Engine (Port 3003)

**Handles all trade execution and DEX interactions.**

**API Endpoints:**
```
POST /api/trade/buy
{
  tokenAddress: '0x...',
  amountCore: 1.0,
  slippage: 0.01,
  deadline: 1234567890
}

POST /api/trade/sell
{
  tokenAddress: '0x...',
  amountToken: 1000,
  slippage: 0.01
}

POST /api/trade/simulate
GET  /api/trade/estimate-gas
```

**Connects to:**
- Core Blockchain RPC
- DEX Smart Contracts (IcecreamSwap, ShadowSwap)
- PostgreSQL (trade history)
- Redis (rate limiting)

### 6. Blockchain Monitor (Background Service)

**Monitors blockchain for events and updates database.**

**Monitoring:**
```javascript
// Events watched
- TokenCreated (from MemeFactory)
- Buy/Sell (from DEX routers)
- Transfer (from tokens)
- LiquidityAdded/Removed
- PriceUpdate (from oracles)
```

**Updates:**
- Token prices every block
- Holder counts
- Liquidity changes
- Volume tracking
- Honeypot detection

### 7. Telegram Bot (Port 3002 for webhooks)

**User interface through Telegram.**

**Connections:**
```javascript
// WebSocket connection for real-time data
const ws = new WebSocket('ws://localhost:8081');
ws.on('message', (data) => {
  // Send alerts to users
  bot.telegram.sendMessage(chatId, formatAlert(data));
});

// Trading Engine for trade execution
const executeTrade = async (params) => {
  const response = await fetch('http://localhost:3003/api/trade/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return response.json();
};

// API Gateway for data
const getTokenInfo = async (address) => {
  const response = await fetch(`http://localhost:3001/api/tokens/${address}`);
  return response.json();
};
```

### 8. Core API Service

**Wrapper for Core blockchain interactions.**

**Functions:**
- Get block data
- Get transaction receipts
- Call smart contract methods
- Estimate gas prices
- Get account balances

## Inter-Service Communication

### Authentication Flow

```mermaid
sequenceDiagram
    User->>Telegram Bot: /start
    Telegram Bot->>API Gateway: Generate auth token
    API Gateway->>PostgreSQL: Create user session
    API Gateway-->>Telegram Bot: Return JWT
    Telegram Bot-->>User: Authenticated
    User->>WebSocket: Connect with JWT
    WebSocket->>Redis: Validate session
    WebSocket-->>User: Connected
```

### Trade Execution Flow

```mermaid
sequenceDiagram
    User->>Telegram Bot: /buy TOKEN 1
    Telegram Bot->>Trading Engine: Execute buy
    Trading Engine->>Core RPC: Check balances
    Trading Engine->>Core RPC: Estimate gas
    Trading Engine->>DEX Contract: Swap tokens
    DEX Contract-->>Trading Engine: Transaction hash
    Trading Engine->>PostgreSQL: Save trade
    Trading Engine->>Redis: Publish event
    Redis-->>WebSocket: Trade event
    WebSocket-->>All Clients: Broadcast trade
    Trading Engine-->>Telegram Bot: Trade result
    Telegram Bot-->>User: Success message
```

### Price Update Flow

```mermaid
sequenceDiagram
    Blockchain Monitor->>Core RPC: Get latest block
    Core RPC-->>Blockchain Monitor: Block data
    Blockchain Monitor->>DEX Contracts: Get reserves
    DEX Contracts-->>Blockchain Monitor: Price data
    Blockchain Monitor->>PostgreSQL: Update prices
    Blockchain Monitor->>Redis: Publish price
    Redis-->>WebSocket: Price update
    WebSocket-->>All Clients: Broadcast price
```

## Configuration

### Service Discovery

**Environment Variables:**
```bash
# Each service needs to know where others are
API_GATEWAY_URL=http://localhost:3001
WEBSOCKET_URL=ws://localhost:8081
TRADING_ENGINE_URL=http://localhost:3003
CORE_RPC_URL=https://rpc.coredao.org
POSTGRES_HOST=localhost
REDIS_HOST=localhost
```

### Internal API Keys

**For service-to-service authentication:**
```javascript
// Trading Engine validates requests
app.use((req, res, next) => {
  const apiKey = req.headers['x-internal-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### Health Checks

**Each service exposes health endpoint:**
```javascript
app.get('/health', async (req, res) => {
  const checks = {
    service: 'running',
    database: await checkDatabase(),
    redis: await checkRedis(),
    dependencies: await checkDependencies()
  };
  
  const healthy = Object.values(checks).every(v => v === true || v === 'running');
  res.status(healthy ? 200 : 503).json(checks);
});
```

## Message Formats

### Redis Pub/Sub

```javascript
// Publishing
redis.publish('channel:name', JSON.stringify({
  type: 'event_type',
  data: { /* payload */ },
  timestamp: Date.now(),
  source: 'service_name'
}));

// Subscribing
redis.subscribe('channel:name');
redis.on('message', (channel, message) => {
  const data = JSON.parse(message);
  handleEvent(data);
});
```

### WebSocket Messages

```javascript
// Client to Server
{
  type: 'subscribe' | 'unsubscribe' | 'ping',
  channel: 'channel_name',
  params: { /* optional */ }
}

// Server to Client
{
  type: 'data' | 'error' | 'subscribed' | 'pong',
  channel: 'channel_name',
  data: { /* payload */ },
  timestamp: Date.now()
}
```

### REST API Responses

```javascript
// Success
{
  success: true,
  data: { /* result */ },
  timestamp: Date.now()
}

// Error
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human readable message',
    details: { /* optional */ }
  },
  timestamp: Date.now()
}
```

## Security

### Network Isolation

```yaml
# Docker networks
networks:
  public:    # Frontend-facing services
  internal:  # Service-to-service
  database:  # Database access only
```

### Rate Limiting

```javascript
// Per service
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests
  keyGenerator: (req) => req.user?.id || req.ip
});

app.use('/api', limiter);
```

### Authentication

```javascript
// JWT validation middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

## Monitoring

### Logs Aggregation

```bash
# Centralized logging
tail -f logs/*.log | grep ERROR

# Service-specific
docker logs -f core-api --since 1h

# Pattern search
grep "trade:execute" logs/trading-engine.log
```

### Metrics Collection

```javascript
// Prometheus metrics
const promClient = require('prom-client');

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});
```

## Troubleshooting

### Service Can't Connect

```bash
# Check if service is running
docker ps | grep service-name
lsof -i :PORT

# Test connectivity
telnet localhost PORT
curl http://localhost:PORT/health

# Check firewall
sudo ufw status
```

### Message Not Received

```bash
# Monitor Redis pub/sub
redis-cli MONITOR | grep channel_name

# Check WebSocket connections
netstat -an | grep 8081

# View service logs
tail -f logs/websocket.log | grep ERROR
```

### Database Connection Issues

```sql
-- Check connections
SELECT pid, usename, application_name, client_addr, state 
FROM pg_stat_activity;

-- Kill stuck connection
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' AND state_change < NOW() - INTERVAL '1 hour';
```

## Best Practices

1. **Always use connection pooling** for database connections
2. **Implement retry logic** for service-to-service calls
3. **Use circuit breakers** for external dependencies
4. **Cache frequently accessed data** in Redis
5. **Log all inter-service communications** for debugging
6. **Version your APIs** for backward compatibility
7. **Use health checks** before routing traffic
8. **Implement graceful shutdowns** for all services
9. **Monitor and alert** on connection failures
10. **Document all API changes** in this guide