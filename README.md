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
├── contracts/           # Smart contracts
├── backend/            # Microservices
│   ├── api/           # REST API gateway
│   ├── blockchain-monitor/
│   ├── trading-engine/
│   └── core-api-service/
├── telegram-bot/       # Telegram bot
├── web-app/           # Next.js frontend
├── websocket/         # Real-time data
└── shared/            # Shared utilities
```

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
# Network
NETWORK=testnet # or mainnet
CORE_TESTNET_RPC_URL=https://rpc.test.btcs.network
CORE_MAINNET_RPC_URL=https://rpc.coredao.org

# API Keys
CORESCAN_API_KEY=your_api_key
TELEGRAM_BOT_TOKEN=your_bot_token

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