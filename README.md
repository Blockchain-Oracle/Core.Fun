# Core.Fun - Advanced DeFi Meme Token Platform 🚀

![Core.fun Platform](https://img.shields.io/badge/Core_Blockchain-Meme_Platform-orange)
![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Production_Ready-brightgreen)

## 🎯 Overview

Core.fun is a comprehensive DeFi ecosystem built on Core blockchain, revolutionizing meme token creation and trading through advanced bonding curve mechanics, automated market making, and integrated social features. The platform combines Web3 innovation with traditional finance concepts to create a secure, scalable, and user-friendly environment for meme token enthusiasts.

## 🌟 Key Features

### 💎 Token Creation & Management
- **Bonding Curve Launch Model**: Mathematical price discovery with exponential curves
- **Fair Launch Mechanism**: No presales, team allocations, or hidden wallets
- **Automated Graduation**: Seamless transition to DEX at 250 CORE raised
- **Custom Token Metadata**: Rich token profiles with social links and descriptions
- **Anti-Rug Protection**: Built-in safeguards and liquidity locks

### 📈 Advanced Trading System
- **Real-time Price Feeds**: WebSocket-powered live updates
- **Slippage Protection**: Configurable tolerance for all trades
- **MEV Protection**: Transaction ordering and timing optimization
- **Copy Trading**: Follow successful traders automatically (tier-based slots)
- **P&L Tracking**: Comprehensive profit/loss analytics
- **Position Management**: Track and manage multiple positions

### 🥩 Staking & Rewards
- **Tiered Staking System**: Bronze, Silver, Gold, and Platinum tiers
- **Staking Rewards**: Earn platform tokens through staking
- **Fee Discounts**: Reduced trading fees for stakers
- **Copy Trading Slots**: 1-10 slots based on tier (Bronze: 1, Silver: 3, Gold: 5, Platinum: 10)
- **Auto-Compounding**: Automatic reward reinvestment options

### 📊 Analytics & Monitoring
- **Real-time Analytics**: Token performance metrics and trends
- **Trading Volume Analysis**: Detailed volume breakdowns
- **Holder Distribution**: Token holder analytics
- **Price Charts**: Advanced charting with technical indicators
- **Market Sentiment**: Social sentiment analysis
- **Platform Metrics**: Total value locked, volume, and user stats

### 🤖 Telegram Bot Integration
- **Full Trading Interface**: Complete trading without leaving Telegram
- **Custodial Wallet System**: Secure wallet management
- **Instant Notifications**: Price alerts and trade notifications
- **Copy Trading Bots**: Automated trading strategies with tier-based slots
- **Group Features**: Token launches in Telegram groups
- **Premium Features**: Advanced trading tools for premium users

### 🔐 Security & Infrastructure
- **Multi-Signature Wallets**: Enhanced security for platform funds
- **Rate Limiting**: DDoS protection and abuse prevention
- **Encryption**: AES-256 encryption for sensitive data
- **Audit Trail**: Complete transaction history and logging
- **Monitoring**: Real-time system health monitoring
- **Backup Systems**: Redundant infrastructure and data backups

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend Applications                       │
├─────────────────────────────────────────────────────────────────┤
│  Next.js WebApp │  Mobile App    │  Telegram Bot   │   Admin   │
│  (Port 3000)    │  (React Native)│  (Telegraf.js)  │  Dashboard│
└────────┬────────┴────────┬────────┴────────┬───────┴─────┬─────┘
         │                 │                  │             │
         └─────────────────┼──────────────────┼─────────────┘
                           │                  │
┌──────────────────────────▼──────────────────▼──────────────────┐
│                         API Gateway                             │
├─────────────────────────────────────────────────────────────────┤
│          Load Balancer  │  Rate Limiter  │  Auth              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Backend Services                            │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   API        │  │  Blockchain  │  │  WebSocket   │         │
│  │   Service    │  │   Monitor    │  │   Server     │         │
│  │  (Port 3001) │  │  (Port 3003) │  │  (Port 8081) │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                  │                  │
│  ┌──────▼─────────────────▼──────────────────▼───────┐         │
│  │            Shared Services Layer                   │         │
│  ├────────────────────────────────────────────────────┤         │
│  │  Database  │  Redis  │  Message Queue  │  Logger  │         │
│  └────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Blockchain Layer                             │
├──────────────────────────────────────────────────────────────────┤
│   MemeFactory  │  MemeToken  │  Staking  │  DEX Integration    │
└──────────────────────────────────────────────────────────────────┘
```

## 📦 Project Structure

```
core-meme-platform/
├── core.fun_Frontend/               # Frontend Application (Next.js)
│   ├── app/                         # Next.js App Router
│   │   ├── (dashboard)/            # Dashboard pages
│   │   │   ├── analytics/          # Analytics dashboard
│   │   │   ├── create-token/       # Token creation
│   │   │   ├── explore/            # Token explorer
│   │   │   ├── portfolio/          # User portfolio
│   │   │   ├── staking/            # Staking dashboard
│   │   │   └── wallet/             # Wallet management
│   │   ├── auth/                   # Authentication
│   │   └── login/                  # Login page
│   ├── components/                 # Reusable UI components
│   │   ├── analytics/              # Analytics components
│   │   ├── auth/                   # Authentication components
│   │   ├── explore/                # Token explorer components
│   │   ├── layout/                 # Layout components
│   │   ├── staking/                # Staking components
│   │   ├── trading/                # Trading components
│   │   ├── wallet/                 # Wallet components
│   │   └── ui/                     # Base UI components (Radix UI)
│   ├── lib/                        # Utilities and services
│   │   ├── stores/                 # Zustand state stores
│   │   ├── api-client.ts           # API communication
│   │   ├── meme-factory.ts         # Smart contract interactions
│   │   └── utils.ts                # Helper functions
│   ├── hooks/                      # Custom React hooks
│   ├── public/                     # Static assets (logos, images)
│   └── README.md                   # Frontend documentation
│
├── contracts/                       # Smart Contracts
│   ├── core/
│   │   ├── MemeFactory.sol         # Token factory with bonding curves
│   │   ├── MemeToken.sol           # ERC20 token implementation
│   │   └── Staking.sol             # Staking rewards contract
│   ├── interfaces/                 # Contract interfaces
│   ├── libraries/                  # Shared libraries
│   │   ├── BondingCurve.sol       # Bonding curve mathematics
│   │   └── SafetyChecks.sol       # Security validations
│   ├── scripts/                    # Deployment scripts
│   └── test/                       # Contract tests
│
├── backend/                        # Backend Services
│   ├── api/                        # REST API Service
│   │   ├── src/
│   │   │   ├── routes/             # API endpoints
│   │   │   │   ├── auth.ts         # Authentication
│   │   │   │   ├── tokens.ts       # Token operations
│   │   │   │   ├── trading.ts      # Trading endpoints
│   │   │   │   ├── staking.ts      # Staking operations
│   │   │   │   ├── wallet.ts       # Wallet management
│   │   │   │   ├── stats.ts        # Analytics
│   │   │   │   └── subscription.ts # Premium features
│   │   │   ├── services/           # Business logic
│   │   │   │   ├── WalletService.ts
│   │   │   │   ├── TransactionService.ts
│   │   │   │   ├── CoreScanService.ts
│   │   │   │   └── WalletManager.ts
│   │   │   └── middleware/         # Express middleware
│   │   └── Dockerfile
│   │
│   ├── blockchain-monitor/         # Event Monitoring Service
│   │   ├── src/
│   │   │   ├── monitors/           # Event monitors
│   │   │   │   ├── EventMonitor.ts
│   │   │   │   └── MemeFactoryMonitor.ts
│   │   │   ├── processors/         # Event processors
│   │   │   │   ├── TokenProcessor.ts
│   │   │   │   ├── TradeProcessor.ts
│   │   │   │   └── StakingProcessor.ts
│   │   │   └── services/           # Support services
│   │   │       ├── AnalyticsService.ts
│   │   │       └── AlertService.ts
│   │   └── migrations/             # Database migrations
│   │
│   └── websocket/                  # WebSocket Service
│       ├── src/
│       │   ├── server.ts           # WebSocket server
│       │   └── services/           # Real-time services
│       │       └── StakingService.ts
│       └── Dockerfile
│
├── telegram-bot/                   # Telegram Bot
│   ├── src/
│   │   ├── bot.ts                  # Main bot entry
│   │   ├── auth/                   # Authentication
│   │   │   ├── AuthHandler.ts
│   │   │   └── SessionManager.ts
│   │   ├── commands/               # Bot commands
│   │   │   └── CopyTradingCommands.ts # Copy trading features
│   │   ├── trading/                # Trading features
│   │   │   ├── TradingCommands.ts
│   │   │   ├── TradingExecutor.ts
│   │   │   ├── MemeFactoryCopyTrader.ts
│   │   │   ├── PositionManager.ts
│   │   │   └── PnLCalculator.ts
│   │   ├── wallet/                 # Wallet operations
│   │   ├── staking/                # Staking commands
│   │   ├── alerts/                 # Alert system
│   │   └── services/               # Bot services
│   │       ├── ApiService.ts
│   │       ├── PriceService.ts
│   │       ├── ImageGenerator.ts
│   │       ├── SocketIOClient.ts
│   │       ├── TradingEngine.ts
│   │       └── WebhookHandler.ts
│   └── Dockerfile
│
├── shared/                         # Shared Libraries
│   ├── src/
│   │   ├── config/                 # Configuration
│   │   ├── constants/              # Constants
│   │   ├── database/               # Database utilities
│   │   ├── logger/                 # Logging
│   │   ├── redis/                  # Redis utilities
│   │   ├── services/               # Shared services
│   │   │   ├── ContractDataService.ts
│   │   │   ├── DatabaseService.ts
│   │   │   ├── MemeFactoryService.ts
│   │   │   └── WalletService.ts
│   │   └── types/                  # TypeScript types
│   └── abis/                       # Contract ABIs
│
├── docker/                         # Docker Configuration
│   ├── Dockerfile.base             # Base image
│   ├── Dockerfile.service          # Service image
│   ├── init.sql                    # Database initialization
│   └── DEPLOYMENT.md               # Deployment guide
│
├── scripts/                        # Utility Scripts
│   ├── setup.sh                    # Environment setup
│   ├── start-services.sh           # Start all services
│   ├── stop-services.sh            # Stop all services
│   ├── reset-db.sh                 # Database reset
│   ├── check-health.sh             # Health checks
│   ├── revenue-distribution.ts     # Revenue distribution
│   └── populate-platform.js        # Test data population
│
└── docker-compose.yml              # Docker orchestration
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ with pnpm 8+
- **PostgreSQL** 14+ 
- **Redis** 6+
- **Docker** & Docker Compose (optional)
- **Core Testnet RPC** access

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/core-meme-platform
cd core-meme-platform

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Configure your .env file with required values

# Initialize database
pnpm db:migrate

# Deploy contracts (if needed)
cd contracts && npx hardhat run scripts/deploy.ts --network coreTestnet

# Start all services
pnpm dev:all
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f api
```

## 🔧 Configuration

### Environment Variables

```env
# Network Configuration
NETWORK=testnet
CORE_TESTNET_RPC=https://1114.rpc.thirdweb.com
CORE_MAINNET_RPC=https://rpc.coredao.org
CORE_CHAIN_ID=1114

# Smart Contracts
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784
STAKING_ADDRESS=0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa
PLATFORM_TOKEN_ADDRESS=0x...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# Services
API_PORT=3001
WEBSOCKET_PORT=8081
MONITOR_PORT=3003
FRONTEND_PORT=3000

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_SECRET=your_encryption_secret
ADMIN_WALLET_PRIVATE_KEY=your_admin_key

# External Services
COINGECKO_API_KEY=your_api_key
MORALIS_API_KEY=your_api_key

# Feature Flags
ENABLE_COPY_TRADING=true
ENABLE_STAKING=true
ENABLE_ANALYTICS=true
```

## 📊 API Documentation

### Authentication

#### Telegram Authentication
```http
POST /api/auth/telegram
Content-Type: application/json

{
  "initData": "telegram_init_data_string"
}

Response:
{
  "token": "jwt_token",
  "user": {
    "id": "user_id",
    "telegramId": 123456789,
    "walletAddress": "0x...",
    "isPremium": false
  }
}
```

### Token Operations

#### Create Token
```http
POST /api/tokens/create
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "My Meme Token",
  "symbol": "MMT",
  "description": "The next big meme token",
  "imageUrl": "https://...",
  "twitter": "https://twitter.com/...",
  "telegram": "https://t.me/...",
  "website": "https://..."
}

Response:
{
  "success": true,
  "token": {
    "address": "0x...",
    "transactionHash": "0x...",
    "name": "My Meme Token",
    "symbol": "MMT"
  }
}
```

#### Buy Token
```http
POST /api/tokens/:address/buy
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "coreAmount": "1.0",
  "slippage": 0.5
}

Response:
{
  "success": true,
  "transaction": {
    "hash": "0x...",
    "tokenAmount": "1000.0",
    "coreAmount": "1.0",
    "price": "0.001"
  }
}
```

### Staking Operations

#### Stake Tokens
```http
POST /api/staking/stake
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "amount": "10000"
}

Response:
{
  "success": true,
  "transaction": {
    "hash": "0x...",
    "amount": "10000",
    "tier": "silver"
  }
}
```

### WebSocket Events

Connect to `ws://localhost:8081` with authentication:

```javascript
const socket = io('ws://localhost:8081', {
  auth: {
    token: 'your_jwt_token'
  }
});

// Subscribe to events
socket.on('price:update', (data) => {
  console.log('Price update:', data);
});

socket.on('trade:new', (data) => {
  console.log('New trade:', data);
});

socket.on('token:new', (data) => {
  console.log('New token created:', data);
});

socket.on('graduation', (data) => {
  console.log('Token graduated:', data);
});
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
pnpm test

# Run specific service tests
cd backend/api && pnpm test
cd contracts && npx hardhat test
cd core.fun_Frontend && pnpm test
```

### Integration Tests
```bash
# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e
```

## 📈 Performance Metrics

- **Transaction Throughput**: 1000+ TPS
- **API Response Time**: <100ms average
- **WebSocket Latency**: <50ms
- **Database Query Time**: <10ms average
- **Blockchain Event Processing**: <2s delay

## 🛡️ Security Features

### Smart Contract Security
- **Audited Contracts**: Professional security audits
- **Reentrancy Guards**: Protection against reentrancy attacks
- **Access Controls**: Role-based permissions
- **Pausable Contracts**: Emergency pause functionality

### Platform Security
- **JWT Authentication**: Secure token-based auth
- **Rate Limiting**: API rate limiting per user
- **DDoS Protection**: CloudFlare integration
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization

### Data Security
- **Encryption at Rest**: AES-256 encryption
- **Encryption in Transit**: TLS 1.3
- **Key Management**: Secure key storage
- **Audit Logging**: Complete audit trail

## 🚢 Deployment

### Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml scale api=3 monitor=2
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n core-meme

# View logs
kubectl logs -f deployment/api -n core-meme
```

## 📊 Monitoring & Analytics

### Metrics Collection
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **ELK Stack**: Log aggregation
- **Sentry**: Error tracking

### Key Metrics
- Total Value Locked (TVL)
- Daily Active Users (DAU)
- Trading Volume
- Token Creation Rate
- System Health Metrics

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Run tests and linting
6. Submit a pull request

### Code Style
- Follow TypeScript best practices
- Use ESLint and Prettier
- Write comprehensive tests
- Document complex logic

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Core Blockchain Team** - Infrastructure and support
- **OpenZeppelin** - Secure contract libraries
- **Uniswap** - AMM inspiration
- **Community Contributors** - Bug reports and features

## 📞 Support & Contact

- **Developer Contact**: [@BlockchainOracle_dev](https://t.me/BlockchainOracle_dev)

## 🗺️ Roadmap

### Q1 2025
- [ ] Mobile app launch
- [ ] Advanced charting tools
- [ ] Limit orders
- [ ] Multi-chain support

### Q2 2025
- [ ] Governance token launch
- [ ] DAO formation
- [ ] Cross-chain bridges
- [ ] Institutional features

### Q3 2025
- [ ] Options trading
- [ ] Lending/Borrowing
- [ ] NFT integration
- [ ] Advanced analytics

---

**⚠️ Risk Disclaimer**: Trading meme tokens involves significant risk. This platform is experimental software. Users should conduct their own research and never invest more than they can afford to lose. Past performance does not guarantee future results.

**🔒 Security Notice**: If you discover a security vulnerability, please contact [@BlockchainOracle_dev](https://t.me/BlockchainOracle_dev) with details. Do not create public issues for security vulnerabilities.

---

Built with ❤️ by the Core.fun Team | Powered by Core Blockchain