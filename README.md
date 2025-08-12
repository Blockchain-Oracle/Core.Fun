# Core Meme Platform 🚀

A professional meme token launcher platform on Core blockchain, combining token creation, trading, and analytics in one integrated ecosystem.

## 🎯 Features

### Token Launcher (Pump.fun Style)
- Simple token creation with bonding curves
- Fair launch mechanism
- Social features (comments, likes)
- Anti-rug protections

### Universal Token Explorer (DexScreener Style)
- Track ALL tokens on Core (not just ours)
- Real-time price charts
- Volume and liquidity tracking
- Honeypot detection
- Rug score calculation

### Telegram Trading Bot
- Buy/Sell/Snipe commands
- Copy trading
- Automated alerts for new tokens
- Subscription-based premium features

### Web Application
- Modern Next.js interface
- Connect wallet (MetaMask)
- Create and launch tokens
- Trade and track portfolio

## 🏗️ Architecture

```
core-meme-platform/
├── contracts/              # Smart contracts (Solidity)
│   ├── MemeFactory.sol    # Token factory with bonding curves
│   ├── MemeToken.sol      # ERC20 token with anti-rug features
│   └── Staking.sol        # Platform token staking
├── backend/               # Microservices
│   ├── api/              # REST API gateway (Port 3001)
│   ├── blockchain-monitor/ # Real-time blockchain event monitoring
│   ├── trading-engine/    # DEX integration & trade execution
│   └── core-api-service/  # Core blockchain API wrapper
├── telegram-bot/          # Full-featured Telegram trading bot
├── web-app/              # Next.js frontend application
├── websocket/            # Real-time data streaming (Port 8081)
└── shared/               # Shared types, constants, utilities
```

## 🔗 Blockchain Integration

### DEX Integration
- **IcecreamSwap V2**: Primary DEX for trading
  - Factory: `0x9E6d21E759A7A288b80eef94E4737D313D31c13f`
  - Router: `0xBb5e1777A331ED93E07cF043363e48d320eb96c4`

### External APIs
- **CoinGecko**: Real-time CORE/USD pricing
- **Core Scan**: Token verification and holder data

## 📋 Deployed Contracts (Core Testnet)

| Contract | Address | Explorer Link |
|----------|---------|---------------|
| MemeFactory | `0x04242CfFdEC8F96A46857d4A50458F57eC662cE1` | [View on Scan](https://scan.test.btcs.network/address/0x04242CfFdEC8F96A46857d4A50458F57eC662cE1) |
| Platform Token (CMP) | `0x96611b71A4DE5B8616164B650720ADe10948193F` | [View on Scan](https://scan.test.btcs.network/address/0x96611b71A4DE5B8616164B650720ADe10948193F) |
| Staking Contract | `0x95F1588ef2087f9E40082724F5Da7BAD946969CB` | [View on Scan](https://scan.test.btcs.network/address/0x95F1588ef2087f9E40082724F5Da7BAD946969CB) |
| Treasury Address | `0xe397a72377F43645Cd4DA02d709c378df6e9eE5a` | [View on Scan](https://scan.test.btcs.network/address/0xe397a72377F43645Cd4DA02d709c378df6e9eE5a) |

> **Note**: These are testnet deployments for development and testing. Mainnet deployment will be announced separately.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- PostgreSQL 14+
- Redis 6+
- MetaMask wallet
- Telegram account

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/core-meme-platform
cd core-meme-platform

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Deploy contracts to testnet
pnpm deploy:contracts --network coreTestnet

# Start services
pnpm dev
```

### Environment Variables

```env
# Network Configuration
NETWORK=testnet # or mainnet
CORE_TESTNET_RPC_URL=https://rpc.test2.btcs.network
CORE_MAINNET_RPC_URL=https://rpc.coredao.org

# Contract Addresses (Testnet)
MEME_FACTORY_ADDRESS=0x04242CfFdEC8F96A46857d4A50458F57eC662cE1
PLATFORM_TOKEN=0x96611b71A4DE5B8616164B650720ADe10948193F
STAKING_CONTRACT=0x95F1588ef2087f9E40082724F5Da7BAD946969CB

# API Keys
CORESCAN_API_KEY=your_api_key
TELEGRAM_BOT_TOKEN=your_bot_token
COINGECKO_API_KEY=optional_for_higher_limits

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/core_meme
REDIS_URL=redis://localhost:6379

# Wallet
PRIVATE_KEY=your_private_key # For contract deployment
TREASURY_ADDRESS=your_treasury_address

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
```

## 🔧 Services Overview

### Backend Services

#### 1. **Blockchain Monitor** (`backend/blockchain-monitor`)
Real-time blockchain event monitoring and token analytics.
- Monitors PairCreated, Swap, and Liquidity events
- Calculates rug scores and honeypot detection
- Tracks liquidity across IcecreamSwap V2
- Integrates CoinGecko for CORE/USD pricing
- [Full Documentation](./backend/blockchain-monitor/README.md)

#### 2. **API Gateway** (`backend/api`)
RESTful API gateway for all platform services (Port 3001).
- JWT authentication and authorization
- Real-time wallet balance queries
- Trading operations with slippage protection
- Portfolio tracking and analytics
- [Full Documentation](./backend/api/README.md)

#### 3. **Trading Engine** (`backend/trading-engine`)
Production-ready trading system with MEV protection.
- Unified router for bonding curves and DEX
- IcecreamSwap V2 integration
- Gas optimization and route finding
- Anti-sandwich attack protection
- [Full Documentation](./backend/trading-engine/README.md)

#### 4. **Core API Service** (`backend/core-api-service`)
Wrapper for Core blockchain APIs with caching.
- Token verification and holder data
- Contract verification status
- Historical data aggregation
- Redis caching for performance
- [Full Documentation](./backend/core-api-service/README.md)

### Frontend Services

#### 5. **Telegram Bot** (`telegram-bot`)
Feature-rich trading bot with visual card generation.
- Buy/sell/snipe commands
- Portfolio tracking with P&L
- Copy trading system
- Custom image generation for positions
- [Full Documentation](./telegram-bot/README.md)

#### 6. **WebSocket Server** (`websocket`)
Real-time data streaming service (Port 8081).
- Live price updates from blockchain
- Trade event broadcasting
- Alert notifications
- Supports 10,000+ concurrent connections
- [Full Documentation](./websocket/README.md)

#### 7. **Web Application** (`web-app`)
Modern Next.js frontend application.
- Token launcher interface
- Trading dashboard
- Portfolio management
- Wallet integration (MetaMask)

## 📊 Core API Integration

The platform integrates with Core blockchain APIs:
- **Mainnet**: `https://openapi.coredao.org/api`
- **Testnet**: `https://openapi.test.btcs.network/api`

Features:
- Token verification
- Contract verification
- Transaction monitoring
- Holder analytics
- Historical data

## 💰 Revenue Model

1. **Token Creation Fees**: 0.1 CORE per token
2. **Trading Fees**: 0.5% on platform trades
3. **Subscriptions**: $10-50/month for premium features
4. **API Access**: Tiered pricing for developers
5. **Token Promotion**: Featured slots

## 🔒 Security Features

- Multi-sig treasury
- Time locks on critical functions
- Anti-rug mechanisms
- Honeypot detection
- Max wallet/transaction limits
- Ownership renouncement tracking
- Rate limiting
- DDoS protection

## 📈 Subscription Tiers

### Free Tier
- Basic trading bot
- View token explorer
- 1 token launch per month

### Premium ($10/month)
- All token launch alerts
- Advanced analytics
- Unlimited token launches
- Copy trading
- API access

### Pro ($50/month)
- Everything in Premium
- Custom alerts
- Whale wallet tracking
- Private group access
- Priority support

## 🛠️ Technology Stack

- **Smart Contracts**: Solidity, Hardhat, OpenZeppelin
- **Backend**: Node.js, TypeScript, Express, PostgreSQL, Redis
- **Frontend**: Next.js 14, TypeScript, TailwindCSS, Wagmi
- **Bot**: Telegraf, BullMQ
- **Infrastructure**: Docker, Kubernetes, GitHub Actions

## 📝 Smart Contract Addresses

### Testnet
- MemeFactory: `0x...` (pending deployment)
- Platform Token: `0x...` (pending deployment)

### Mainnet
- MemeFactory: `0x...` (pending deployment)
- Platform Token: `0x...` (pending deployment)

## 🧪 Testing

```bash
# Run contract tests
pnpm test:contracts

# Run backend tests
pnpm test:backend

# Run integration tests
pnpm test:integration
```

## 📚 Documentation

- [API Documentation](./docs/API.md)
- [Smart Contract Documentation](./docs/CONTRACTS.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. The platform is currently in beta. Please conduct your own research before trading any tokens. Not financial advice.

## 🔗 Links

- Website: [corememe.io](#) (coming soon)
- Telegram Bot: [@CoreMemeBot](#) (coming soon)
- Twitter: [@CoreMemePlatform](#) (coming soon)
- Discord: [Join our community](#) (coming soon)

## 🎯 Roadmap

### Phase 1: MVP ✅
- [x] Smart contracts
- [x] Core API integration
- [x] Basic folder structure
- [ ] Simple web interface
- [ ] Basic Telegram bot

### Phase 2: Explorer
- [ ] Universal token monitoring
- [ ] Analytics dashboard
- [ ] Advanced alerts
- [ ] Honeypot detection

### Phase 3: Premium
- [ ] Subscription system
- [ ] Copy trading
- [ ] API for developers
- [ ] Advanced analytics

### Phase 4: Production
- [ ] Security audit
- [ ] Performance optimization
- [ ] Mainnet deployment
- [ ] Marketing launch

---

Built with ❤️ for the Core ecosystem