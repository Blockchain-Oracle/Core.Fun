# Blockchain Monitor Service

Real-time blockchain monitoring service for Core blockchain, tracking MemeFactory tokens and DEX activity.

## Features

- ✅ **MemeFactory Monitoring** (when configured)
  - Token creation events
  - Bonding curve purchases
  - Token launches to DEX
  - Platform fee tracking

- ✅ **DEX Monitoring**
  - IcecreamSwap V2 & V3 (Mainnet)
  - ShadowSwap (Testnet)
  - Pair creation events
  - Swap transactions
  - Liquidity changes

- ✅ **Token Analytics**
  - Honeypot detection
  - Rug pull risk scoring
  - Ownership concentration analysis
  - Trading restrictions detection

- ✅ **Alert System**
  - Critical alerts for rug pulls
  - Large trade notifications
  - Liquidity removal warnings
  - WebSocket broadcasting

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Start Services

```bash
# Start Redis (required)
docker-compose up -d redis

# Start PostgreSQL (required)
docker-compose up -d postgres

# Run database migrations
pnpm run migrate
```

### 4. Run the Monitor

```bash
# Development mode (testnet)
pnpm run dev

# Production mode (mainnet)
pnpm run start:prod

# Testnet mode
pnpm run start:testnet
```

## Configuration

### Platform Contracts

The service can monitor your MemeFactory contracts when deployed. Update these in `.env`:

```env
# When you deploy to testnet
MEME_FACTORY_TESTNET=0x... # Your deployed address
MEME_FACTORY_TESTNET_BLOCK=123456 # Deployment block

# When you deploy to mainnet
MEME_FACTORY_MAINNET=0x... # Your deployed address
MEME_FACTORY_MAINNET_BLOCK=789012 # Deployment block
```

**Note**: If no MemeFactory address is configured, the service will still monitor all DEX activity on Core blockchain.

### Network Selection

```env
NETWORK=testnet # or mainnet
```

### Monitoring Options

```env
START_BLOCK=0 # Start from specific block (0 = current - 1000)
CONFIRMATIONS=3 # Block confirmations before processing
BATCH_SIZE=100 # Blocks per batch for historical sync
```

## Architecture

```
blockchain-monitor/
├── src/
│   ├── config/
│   │   ├── contracts.ts    # Platform contracts configuration
│   │   └── dex.ts          # DEX configurations
│   ├── monitors/
│   │   ├── EventMonitor.ts # Base monitor class
│   │   ├── MemeFactoryMonitor.ts # Our contracts monitor
│   │   └── DexMonitor.ts   # DEX activity monitor
│   ├── processors/
│   │   ├── TokenProcessor.ts # Process new tokens
│   │   ├── TradeProcessor.ts # Process trades
│   │   └── LiquidityProcessor.ts # Process liquidity
│   ├── services/
│   │   ├── DatabaseService.ts # PostgreSQL interface
│   │   ├── AnalyticsService.ts # Token analysis
│   │   └── AlertService.ts # Alert management
│   └── main.ts # Entry point
```

## Monitoring Flow

1. **Without MemeFactory Address**:
   - Monitors all DEX pairs on Core
   - Tracks all token trades
   - Analyzes new tokens from any source

2. **With MemeFactory Address**:
   - Everything above PLUS:
   - Monitors your factory's token creations
   - Tracks bonding curve purchases
   - Special analytics for your tokens
   - Platform metrics and fees

## API Integration

The monitor publishes events to Redis channels:

- `token-events`: New tokens and updates
- `trade-events`: Trade transactions
- `liquidity-events`: Liquidity changes
- `pair-events`: New pairs created
- `alerts`: Critical alerts

Subscribe to these channels in your backend services.

## Database Schema

Tables created automatically:
- `tokens`: All tokens discovered
- `pairs`: DEX pairs
- `trades`: Trade transactions
- `liquidity_events`: Add/remove liquidity
- `token_analytics`: Calculated metrics
- `alerts`: Generated alerts
- `trader_profiles`: Wallet analytics

## Deployment

### Docker

```bash
# Build image
docker build -t core-monitor .

# Run with docker-compose
docker-compose up -d
```

### PM2

```bash
# Build first
pnpm run build

# Start with PM2
pm2 start dist/main.js --name "core-monitor"
```

## Troubleshooting

### No MemeFactory Configured

```
⚠️ No platform contracts configured. Monitoring will proceed with DEX activity only.
```

This is normal if you haven't deployed contracts yet. The service will still monitor all DEX activity.

### Database Connection Failed

Ensure PostgreSQL is running:
```bash
docker-compose up -d postgres
```

### Redis Connection Failed

Ensure Redis is running:
```bash
docker-compose up -d redis
```

## Development

### Adding New Events

1. Update event ABI in monitor
2. Add handler method
3. Update processor if needed

### Testing

```bash
# Run tests
pnpm test

# With coverage
pnpm test:coverage
```

## License

MIT