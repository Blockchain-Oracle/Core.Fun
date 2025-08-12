# Blockchain Monitor Service

Real-time blockchain monitoring service for Core blockchain, tracking MemeFactory tokens and DEX activity. This service provides comprehensive token analytics, honeypot detection, and liquidity monitoring across IcecreamSwap V2.

## 🚀 Features

- ✅ **MemeFactory Monitoring**
  - Token creation events
  - Bonding curve purchases  
  - Token launches to DEX
  - Real-time price tracking from bonding curves
  - Platform fee tracking

- ✅ **DEX Monitoring**
  - IcecreamSwap V2 Integration
  - Real-time pair creation events
  - Swap transaction monitoring
  - Liquidity tracking with USD values
  - CoinGecko API for CORE/USD pricing

- ✅ **Token Analytics** (AnalyticsService.ts)
  - Honeypot detection with contract analysis
  - Rug pull risk scoring (0-100 scale)
  - Ownership concentration analysis
  - Trading restrictions detection (max wallet/tx)
  - Liquidity lock verification
  - Contract verification status

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

```env
# Core Testnet (Chain ID: 1114)
MEME_FACTORY_ADDRESS=0x04242CfFdEC8F96A46857d4A50458F57eC662cE1
PLATFORM_TOKEN=0x96611b71A4DE5B8616164B650720ADe10948193F
STAKING_CONTRACT=0x95F1588ef2087f9E40082724F5Da7BAD946969CB

# IcecreamSwap V2 Configuration
ICECREAM_FACTORY=0x9E6d21E759A7A288b80eef94E4737D313D31c13f
ICECREAM_ROUTER=0xBb5e1777A331ED93E07cF043363e48d320eb96c4
INIT_CODE_HASH=0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3
```

### External APIs

```env
# CoinGecko API for CORE price
COINGECKO_API_KEY=optional_for_higher_rate_limits

# Core Scan API (optional)
CORE_SCAN_API_KEY=your_api_key_here
```

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