# Core.fun - Meme Token Launcher Platform 🚀

A streamlined meme token launcher platform on Core blockchain with bonding curve mechanics, real-time trading, and Telegram integration.

## 🎯 Overview

Core.fun is a simplified, production-ready platform for launching and trading meme tokens on Core blockchain. Using bonding curves for fair launches, it provides a seamless experience for token creators and traders without the complexity of traditional DEX interactions.

## ✨ Key Features

### 🪙 Token Creation & Trading
- **Bonding Curve Launch**: Fair token launches with mathematical price discovery
- **Automated Graduation**: Tokens automatically graduate to DEX at 250 CORE raised
- **No Presales/Team Tokens**: 100% fair launch mechanism
- **1% Platform Fee**: Minimal fees on all trades

### 📊 Real-Time Monitoring
- Live token price updates via WebSocket
- Transaction tracking and history
- Token analytics and holder information
- Event-driven architecture for instant updates

### 🤖 Telegram Bot Integration
- Create and trade tokens directly from Telegram
- Wallet management without seed phrases
- Real-time alerts and notifications
- Mobile-first trading experience

### 🌐 Web Application
- Modern Next.js interface with Zustand state management
- Real-time WebSocket updates
- Portfolio tracking with P&L
- Responsive design for all devices

## 🏗️ Simplified Architecture

```
core-meme-platform/
├── contracts/                 # Smart contracts
│   ├── MemeFactory.sol       # Main factory with bonding curves
│   └── MemeToken.sol         # ERC20 token implementation
│
├── backend/                  # Backend services (4 services only!)
│   ├── api/                  # REST API (Port 3001)
│   ├── blockchain-monitor/   # Event monitoring (Port 3003)
│   └── websocket/            # Real-time updates (Port 8081)
│
├── telegram-bot/             # Telegram bot (Port 3004)
├── frontend/                 # Next.js web app (Port 3000)
└── shared/                   # Shared utilities and types
```

## 🔄 How It Works

### Token Launch Flow
1. **Create Token** → User submits token details + 0.01 CORE fee
2. **Bonding Curve** → Price starts low, increases with each buy
3. **Trading Phase** → Users buy/sell through bonding curve
4. **Graduation** → At 250 CORE raised, adds liquidity to DEX
5. **Free Trading** → Token trades freely on secondary markets

### Trading Flow
```
User → API → MemeFactory Contract → Blockchain
         ↓
    WebSocket → Real-time Updates → Frontend
```

## 📋 Deployed Contracts (Core Testnet)

| Contract | Address | Description |
|----------|---------|-------------|
| MemeFactory | `0x0eeF9597a9B231b398c29717e2ee89eF6962b784` | Token factory and bonding curves |
| Example Token | Various | Tokens created through the platform |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- PostgreSQL 14+
- Redis 6+

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

# Start all services
pnpm dev:all
```

This starts:
- API Service (http://localhost:3001)
- Blockchain Monitor
- WebSocket Server (ws://localhost:8081)
- Telegram Bot

### Frontend Development

```bash
cd frontend
pnpm dev
# Visit http://localhost:3000
```

## 🔧 Configuration

### Environment Variables

```env
# Network
NETWORK=testnet
CORE_TESTNET_RPC=https://rpc.test2.btcs.network

# Contracts
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_SECRET=your_encryption_secret
```

## 📊 Service Architecture

### API Service (Port 3001)
- User authentication (JWT)
- Token creation and trading
- Wallet management
- Transaction execution

### Blockchain Monitor (Port 3003)
- Monitors MemeFactory events
- Processes token creations, trades, graduations
- Sends updates to WebSocket

### WebSocket Server (Port 8081)
- Real-time price updates
- Trade notifications
- New token alerts
- Portfolio updates

### Telegram Bot (Port 3004)
- Full trading interface
- Wallet creation and management
- Real-time notifications
- Copy trading features

## 🛡️ Security Features

- **Custodial Wallets**: Private keys encrypted with AES-256
- **JWT Authentication**: Secure API access
- **Rate Limiting**: Protection against abuse
- **Slippage Protection**: Configurable for all trades
- **Anti-Rug Mechanisms**: Built into token contracts

## 📈 Bonding Curve Mechanics

- **Initial Price**: ~0.0000005 CORE per token
- **Max Supply**: 500,000 tokens during bonding
- **Graduation Target**: 250 CORE raised
- **Price Formula**: Exponential curve (price increases with supply)
- **Platform Fee**: 1% on all trades

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run contract tests
cd contracts && npx hardhat test

# Run API tests
cd backend/api && pnpm test
```

## 📝 API Documentation

### Authentication
```http
POST /api/auth/telegram
Content-Type: application/json

{
  "initData": "telegram_init_data_string"
}
```

### Create Token
```http
POST /api/tokens/create
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "My Token",
  "symbol": "MTK",
  "description": "Token description",
  "imageUrl": "https://...",
  "twitter": "https://twitter.com/...",
  "telegram": "https://t.me/...",
  "website": "https://..."
}
```

### Buy Token
```http
POST /api/tokens/:address/buy
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "coreAmount": "1.0"
}
```

### Sell Token
```http
POST /api/tokens/:address/sell
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "tokenAmount": "1000"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Core blockchain team for the infrastructure
- OpenZeppelin for secure contract libraries
- The meme token community for inspiration

## 📞 Support

- Documentation: [docs.core.fun](https://docs.core.fun)
- Telegram: [@corefun_support](https://t.me/corefun_support)
- Discord: [discord.gg/corefun](https://discord.gg/corefun)

---

**⚠️ Disclaimer**: This is experimental software. Use at your own risk. Always DYOR before trading.