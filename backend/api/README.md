# Backend API Service

## Overview
RESTful API gateway for the Core Meme Platform, providing unified access to all platform services. This service handles user authentication, wallet management, trading operations, and real-time data streaming coordination.

## 🚀 Features

- 🔐 **Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control
  - Session management with Redis

- 💼 **Wallet Management**
  - Multi-wallet support per user
  - Real-time balance queries from blockchain
  - Secure private key encryption
  - Transaction history tracking

- 📊 **Trading Operations**
  - Buy/sell token endpoints
  - Slippage protection
  - Gas estimation
  - Trade history with P&L tracking

- 🔄 **Real-time Integration**
  - WebSocket connection to streaming service (port 8081)
  - Redis pub/sub for event distribution
  - Real-time price updates

- 📈 **Analytics & Data**
  - Token analytics endpoints
  - Portfolio tracking
  - Market data aggregation
  - User statistics

## Architecture

```
┌─────────────────────────────────────────────┐
│              API Gateway (3001)              │
├─────────────────────────────────────────────┤
│   Auth    │  Wallet   │  Trading  │  Market │
├───────────┴───────────┴───────────┴─────────┤
│              Service Layer                   │
├─────────────────────────────────────────────┤
│  PostgreSQL  │  Redis  │  WebSocket (8081)  │
└─────────────────────────────────────────────┘
```

## Installation

```bash
# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env

# Configure your .env file
# Edit database credentials, Redis URL, etc.
```

## Configuration

### Environment Variables

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# WebSocket Integration
WEBSOCKET_URL=ws://localhost:8081

# Core Blockchain
CORE_RPC_URL=https://rpc.test2.btcs.network
NETWORK=testnet

# Security
ENCRYPTION_SECRET=your_256_bit_encryption_secret_here
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
```

## API Endpoints

### Authentication

```typescript
POST   /api/auth/register     // Register new user
POST   /api/auth/login        // Login user
POST   /api/auth/refresh      // Refresh JWT token
POST   /api/auth/logout       // Logout user
GET    /api/auth/me          // Get current user
```

### Wallet Management

```typescript
GET    /api/wallet           // Get user wallets
POST   /api/wallet/create    // Create new wallet
GET    /api/wallet/balance   // Get wallet balance (real blockchain data)
POST   /api/wallet/import    // Import existing wallet
DELETE /api/wallet/:address  // Remove wallet
GET    /api/wallet/export    // Export encrypted private key
```

### Trading

```typescript
POST   /api/trade/buy        // Buy tokens
POST   /api/trade/sell       // Sell tokens
GET    /api/trade/estimate   // Estimate trade output
GET    /api/trade/history    // Get trade history
GET    /api/trade/pending    // Get pending transactions
```

### Market Data

```typescript
GET    /api/tokens           // List all tokens
GET    /api/tokens/:address  // Get token details
GET    /api/tokens/:address/price     // Get token price
GET    /api/tokens/:address/chart     // Get price chart data
GET    /api/tokens/:address/holders   // Get top holders
GET    /api/tokens/:address/trades    // Get recent trades
```

### Portfolio

```typescript
GET    /api/portfolio        // Get user portfolio
GET    /api/portfolio/value  // Get portfolio value
GET    /api/portfolio/pnl    // Get P&L data
GET    /api/portfolio/history // Get portfolio history
```

### Analytics

```typescript
GET    /api/analytics/trending      // Get trending tokens
GET    /api/analytics/new          // Get new tokens
GET    /api/analytics/top-gainers  // Get top gainers
GET    /api/analytics/top-losers   // Get top losers
GET    /api/analytics/volume       // Get volume statistics
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  username VARCHAR,
  wallet_address VARCHAR,
  encrypted_private_key TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Wallets Table
```sql
CREATE TABLE wallets (
  address VARCHAR PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR,
  encrypted_private_key TEXT,
  is_primary BOOLEAN,
  created_at TIMESTAMP
);
```

### Trades Table
```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_address VARCHAR,
  type VARCHAR, -- 'buy' or 'sell'
  amount_token DECIMAL,
  amount_core DECIMAL,
  price DECIMAL,
  tx_hash VARCHAR,
  status VARCHAR,
  created_at TIMESTAMP
);
```

## Real-time Features

### WebSocket Integration
The API connects to the WebSocket server on port 8081 for real-time data:

```typescript
// Connection established in src/services/WebSocketService.ts
const ws = new WebSocket('ws://localhost:8081');

// Subscribe to price updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'prices',
  tokens: ['0x...']
}));
```

### Redis Pub/Sub
Events are distributed via Redis channels:

```typescript
// Publishing events
redis.publish('trade:executed', JSON.stringify(tradeData));

// Subscribing to events
redis.subscribe('trade:executed');
redis.on('message', (channel, message) => {
  // Handle event
});
```

## Security

### Authentication Flow
1. User registers/logs in via Telegram
2. JWT token issued with user claims
3. Token included in Authorization header
4. Middleware validates token on each request

### Private Key Encryption
```typescript
// Encryption using AES-256-GCM
import crypto from 'crypto';

const encrypt = (text: string, secret: string) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  // ... encryption logic
};
```

### Rate Limiting
```typescript
// Applied per IP address
const rateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests'
});
```

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "Wallet not found",
    "details": {}
  }
}
```

Error codes:
- `AUTH_*`: Authentication errors
- `WALLET_*`: Wallet-related errors  
- `TRADE_*`: Trading errors
- `VALIDATION_*`: Input validation errors
- `SYSTEM_*`: System errors

## Testing

```bash
# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Coverage report
pnpm test:coverage
```

## Deployment

### Docker

```bash
# Build image
docker build -t core-api .

# Run with docker-compose
docker-compose up -d
```

### PM2

```bash
# Build
pnpm build

# Start with PM2
pm2 start ecosystem.config.js
```

### Environment-specific builds

```bash
# Development
pnpm dev

# Staging
pnpm start:staging

# Production
pnpm start:production
```

## Monitoring

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected",
  "websocket": "connected"
}
```

### Metrics (Prometheus)
```bash
GET /metrics
```

Exposed metrics:
- `api_requests_total`
- `api_request_duration_seconds`
- `api_errors_total`
- `database_connections_active`
- `redis_operations_total`

## Performance Optimization

1. **Database Query Optimization**
   - Indexed columns for frequent queries
   - Connection pooling with pg-pool
   - Query result caching in Redis

2. **Caching Strategy**
   - Token data: 5 minutes
   - User sessions: 30 minutes
   - Market data: 1 minute

3. **Response Compression**
   - Gzip compression for responses > 1KB
   - CDN for static assets

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Verify connection string
   psql $DATABASE_URL
   ```

2. **WebSocket Connection Failed**
   ```bash
   # Check WebSocket server
   curl http://localhost:8081/health
   
   # Verify WebSocket URL in .env
   ```

3. **Redis Connection Failed**
   ```bash
   # Check Redis status
   redis-cli ping
   
   # Verify Redis URL
   redis-cli -u $REDIS_URL ping
   ```

## API Documentation

Interactive API documentation available at:
- Swagger UI: `http://localhost:3001/api-docs`
- Postman Collection: `docs/postman-collection.json`

## Support

For issues or questions:
- GitHub Issues: [core-meme-platform/issues](https://github.com/core-meme-platform/issues)
- API Documentation: [docs/api.md](../../docs/api.md)
- Discord: [Join our server](https://discord.gg/corememe)