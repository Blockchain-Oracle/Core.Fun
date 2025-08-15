# API Service

Main REST API gateway for Core.fun platform, handling authentication, trading, and wallet management.

## 🚀 Overview

This service is the central backend for the Core.fun platform, providing:
- User authentication via Telegram
- Token creation and trading through MemeFactory contract
- Custodial wallet management
- Transaction execution and tracking

## 🏗️ Architecture

```
Frontend/Bot → API (3001) → MemeFactory Contract
                ↓
            Redis/PostgreSQL
```

## 📋 Endpoints

### Authentication
- `POST /api/auth/telegram` - Login with Telegram

### Tokens
- `GET /api/tokens` - List all tokens
- `GET /api/tokens/:address` - Get token details
- `POST /api/tokens/create` - Create new token
- `POST /api/tokens/:address/buy` - Buy tokens
- `POST /api/tokens/:address/sell` - Sell tokens
- `POST /api/tokens/:address/calculate-buy` - Calculate buy return
- `POST /api/tokens/:address/calculate-sell` - Calculate sell return

### Wallet
- `GET /api/wallet/info` - Get wallet balance and tokens
- `POST /api/wallet/export` - Export encrypted private key

### Trading
- `GET /api/tokens/transactions/:userId` - User's transaction history
- `GET /api/tokens/transaction/:txHash` - Transaction status

## 🔧 Configuration

```env
# Network
CORE_RPC_URL=https://rpc.test2.btcs.network
NETWORK=testnet

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# Contracts
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_SECRET=your-encryption-secret

# Server
API_PORT=3001
```

## 🛡️ Security

### Wallet Management
- Private keys encrypted with AES-256-CBC
- Unique encryption key per user (derived from Telegram ID)
- Keys stored in Redis with expiration

### Authentication
- JWT tokens with 24h expiration
- Rate limiting on all endpoints
- CORS protection

## 📊 Services

### TransactionService
Handles all blockchain transactions:
- Builds transaction data
- Estimates gas
- Signs with user's wallet
- Sends to blockchain
- Tracks pending transactions

### WalletManager
Manages custodial wallets:
- Creates new wallets for users
- Encrypts/decrypts private keys
- Checks balances
- Exports keys (encrypted)

### DatabaseService
PostgreSQL integration:
- User profiles
- Transaction history
- Token metadata
- Analytics data

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
pnpm migrate

# Start development server
pnpm dev

# Start production server
pnpm build && pnpm start
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage
```

## 📝 API Examples

### Create Token
```javascript
const response = await fetch('http://localhost:3001/api/tokens/create', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Token',
    symbol: 'MTK',
    description: 'Best meme token',
    imageUrl: 'https://...',
    twitter: 'https://twitter.com/...',
    telegram: 'https://t.me/...',
    website: 'https://...'
  })
});
```

### Buy Tokens
```javascript
const response = await fetch('http://localhost:3001/api/tokens/0x123.../buy', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    coreAmount: '1.0' // Buy with 1 CORE
  })
});
```

## 🔄 Transaction Flow

1. **Request received** → Validate JWT token
2. **Get user wallet** → Decrypt private key from Redis
3. **Build transaction** → Use MemeFactoryService
4. **Estimate gas** → Add 20% buffer
5. **Sign & send** → Execute on blockchain
6. **Wait for confirmation** → 1 block confirmation
7. **Store history** → Save to database
8. **Return result** → Send txHash to client

## 📊 Error Handling

Common errors and responses:
- `401` - Invalid or expired JWT token
- `400` - Invalid request parameters
- `402` - Insufficient balance
- `500` - Transaction failed

Contract-specific errors:
- `MemeFactory__InsufficientPayment` - Not enough CORE sent
- `MemeFactory__TokenNotFound` - Token doesn't exist
- `MemeFactory__TradingNotActive` - Token already graduated

## 🔗 Dependencies

- **@core-meme/shared** - Shared utilities and MemeFactoryService
- **ethers.js** - Blockchain interaction
- **express** - HTTP server
- **jsonwebtoken** - JWT authentication
- **redis** - Session and wallet storage
- **pg** - PostgreSQL client

## 📄 License

MIT