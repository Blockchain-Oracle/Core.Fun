# Blockchain Monitor Service

Real-time blockchain event monitoring service for MemeFactory contract on Core blockchain.

## 🚀 Overview

This service monitors the MemeFactory contract for important events and processes them in real-time:
- Token creation events
- Buy/sell trades through bonding curves
- Token graduations to DEX
- Price and volume tracking

## 🏗️ Architecture

```
Core Blockchain → Monitor (3003) → Redis Pub/Sub → WebSocket (8081)
                       ↓
                   PostgreSQL
```

## 📊 Monitored Events

### MemeFactory Events
- `TokenCreated` - New token launched
- `TokenPurchased` - Token bought through bonding curve
- `TokenSold` - Token sold through bonding curve
- `TokenLaunched` - Token graduated to DEX (250 CORE raised)
- `PlatformFeeUpdated` - Fee changes
- `TreasuryUpdated` - Treasury address changes

## 🔧 Configuration

```env
# Network
NETWORK=testnet
CORE_TESTNET_RPC=https://rpc.test2.btcs.network

# Contracts
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/corememe
REDIS_HOST=localhost
REDIS_PORT=6379

# Monitoring
START_BLOCK=0  # Start from specific block (0 = latest)
CONFIRMATIONS=3  # Blocks to wait for confirmation
BATCH_SIZE=100  # Events per batch
```

## 📋 Services

### MemeFactoryMonitor
Main monitoring service that:
- Subscribes to contract events
- Processes events with confirmation delay
- Handles reorgs and missed events
- Retries on failure

### TokenProcessor
Processes token-related events:
- Stores token metadata
- Calculates analytics (rug score, honeypot detection)
- Triggers alerts for suspicious activity
- Updates token status

### TradeProcessor  
Processes trade events:
- Records all trades
- Calculates price impact
- Updates volume metrics
- Identifies whale activity
- Tracks trader profiles

### AnalyticsService
Calculates token analytics:
- Rug pull risk score (0-100)
- Honeypot detection
- Ownership concentration
- Liquidity analysis
- Price/volume tracking

### AlertService
Sends real-time alerts:
- New token launches
- Large trades ($100+ USD)
- Whale activity ($500+ USD)
- High price impact trades (>10%)
- Rug pull warnings

## 🚨 Alert Thresholds

```javascript
// Trade alerts
LARGE_TRADE_USD = 100    // Large trade alert
WHALE_TRADE_USD = 500    // Whale activity alert
PRICE_IMPACT_THRESHOLD = 10  // High slippage alert (%)

// Risk alerts
RUG_SCORE_HIGH = 80      // High rug risk
HONEYPOT_DETECTED = true  // Honeypot warning
```

## 📊 Data Processing

### Event Processing Flow
1. **Catch Event** → From blockchain
2. **Wait Confirmations** → Default 3 blocks
3. **Process Event** → Extract and validate data
4. **Store in Database** → PostgreSQL
5. **Calculate Analytics** → Risk scores, metrics
6. **Check Alerts** → Trigger if thresholds met
7. **Publish to Redis** → For WebSocket broadcast

### Redis Channels
- `websocket:new_token` - New token created
- `websocket:trade` - Trade executed
- `websocket:price_update` - Price changed
- `websocket:alerts` - Alert triggered

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start development
pnpm dev

# Start production
pnpm build && pnpm start
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Test event processing
pnpm test:events

# Test analytics
pnpm test:analytics
```

## 📈 Metrics Tracked

### Token Metrics
- Total supply and circulating supply
- Holder count and distribution
- 24h volume and transactions
- Price and market cap
- Liquidity amount

### Trade Metrics
- Trade volume (hourly/daily)
- Number of trades
- Unique traders
- Average trade size
- Buy/sell ratio

### Risk Metrics
- Rug score (0-100)
- Honeypot status
- Ownership concentration
- Liquidity locked status
- Contract verification

## 🔍 Monitoring Dashboard

Access monitoring stats:
```bash
# Check service health
curl http://localhost:3003/health

# Get monitoring stats
curl http://localhost:3003/stats

# Get recent events
curl http://localhost:3003/events/recent
```

## 🛡️ Error Handling

### Automatic Recovery
- Reconnects on RPC failure
- Retries failed transactions (3 attempts)
- Handles block reorganizations
- Catches up on missed blocks

### Manual Recovery
```bash
# Reprocess from specific block
REPROCESS_FROM_BLOCK=12345 pnpm start

# Clear and rebuild analytics
pnpm run rebuild:analytics
```

## 📝 Log Files

- `blockchain-monitor.log` - Main service logs
- `token-processor.log` - Token processing logs
- `trade-processor.log` - Trade processing logs
- `analytics.log` - Analytics calculations
- `alerts.log` - Alert notifications

## 🔗 Dependencies

- **ethers.js** - Blockchain interaction
- **@core-meme/shared** - Shared utilities
- **redis** - Pub/sub messaging
- **pg** - PostgreSQL client
- **winston** - Logging

## 📄 License

MIT