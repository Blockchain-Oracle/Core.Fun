# 🚀 Core Meme Platform - Telegram Trading Bot

## 🏆 Hackathon Submission - Core Blockchain

A professional-grade Telegram trading bot for the Core blockchain with advanced features including real-time trading, copy trading, custom position visualization, and BullX-style authentication.

## ✨ Features

### 🔐 Authentication & Wallet Management
- **BullX-Style Login**: Seamless authentication via deep linking
- **Auto Wallet Generation**: Automatic Core wallet creation on first login
- **Multi-Wallet Support**: Primary, trading, and withdraw wallets
- **Encrypted Storage**: AES-256-CBC encryption for private keys
- **Session Management**: JWT tokens with cross-platform sync

### 💱 Trading Features
- **Quick Buy/Sell**: Preset amounts with custom options
- **Position Tracking**: Real-time P&L for all positions
- **Portfolio Management**: Comprehensive portfolio overview
- **Emergency Sell**: High-slippage market sells
- **Trade History**: Complete transaction logs
- **Honeypot Detection**: Automatic safety checks before trades
- **Rug Score Analysis**: Risk assessment for tokens
- **Transaction Simulation**: Pre-execution validation

### 📊 Analytics & Tracking
- **P&L Calculator**: Detailed profit/loss analysis
- **Position Manager**: Track entry/exit prices and gains
- **Daily/Weekly/Monthly Reports**: Performance metrics
- **Best/Worst Trades**: Performance highlights
- **Win Rate Tracking**: Success rate statistics
- **Real-time Price Updates**: Auto-refresh every 30 seconds
- **Historical Performance**: Track all-time trading metrics

### 🎨 Professional Image Generation
- **Position Cards**: Custom images showing P&L, entry/exit prices
- **Portfolio Overview**: Visual summary of all holdings
- **P&L Charts**: Daily/weekly performance visualization
- **Trade Results**: Success cards for executed trades
- **Token Info Cards**: Market data with safety indicators
- **Professional Design**: Gradient backgrounds, custom fonts
- **Real-time Generation**: Dynamic image creation on-demand

### 🎯 Advanced Features
- **Copy Trading**: Follow successful wallets
  - Automatic trade replication
  - Custom percentage allocation
  - Risk score analysis
  - Whitelist/blacklist tokens
  - Stop loss/take profit settings
- **Sniper Bot**: Auto-buy on liquidity adds
  - Liquidity event monitoring
  - Instant execution on detection
  - Custom amount configuration
- **Price Alerts**: Custom price notifications
- **Wallet Tracking**: Monitor whale wallets
  - Activity notifications
  - Trade pattern analysis
  - Follow/unfollow system
- **MEV Protection**: Anti-sandwich attack measures

### 💎 Subscription Tiers
- **Free**: Basic trading features
- **Premium ($10/month)**: Advanced alerts, copy trading, custom images
- **Pro ($50/month)**: API access, priority execution, unlimited copies

## 🚀 Quick Start

### Installation
```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Configure your bot token and secrets
nano .env
```

### Environment Configuration
```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=YourBotUsername
JWT_SECRET=your_jwt_secret
ENCRYPTION_SECRET=your_encryption_secret

# Core Network
CORE_RPC_URL=https://rpc.coredao.org
NETWORK=mainnet

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# API Services
TRADING_ENGINE_URL=http://localhost:3002
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

### Running the Bot
```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## 📱 Bot Commands

### Basic Commands
- `/start` - Initialize bot and create wallet
- `/help` - Show all commands
- `/wallet` - View wallet dashboard with custom image
- `/balance` - Check balances

### Trading Commands
- `/buy [token] [amount]` - Interactive buy panel with token info
- `/sell [token] [%]` - Sell position with P&L display
- `/ape [token]` - Max buy with high slippage
- `/snipe [token] [amount]` - Setup auto-buy on liquidity

### Portfolio Commands
- `/portfolio` - Visual portfolio card with top positions
- `/pnl` - Detailed P&L report with charts
- `/history` - Complete trade history
- `/stats` - Trading statistics with win rate

### Copy Trading
- `/copy [wallet]` - Start copying successful traders
- `/copies` - View active copy trades
- `/stopcopy [wallet]` - Stop copying
- `/analyze [wallet]` - Analyze wallet performance

### Alerts & Tracking
- `/track [wallet]` - Track whale wallet activity
- `/alerts` - Configure price alerts
- `/watch [token]` - Add to watchlist
- `/trending` - Top gaining tokens with visuals

## 🔄 Authentication Flow

### Web → Telegram → Web
1. **User clicks "Login with Telegram"** on website
2. **Backend generates auth code** via `/api/auth/init`
3. **User redirected to** `t.me/YourBot?start=auth_CODE`
4. **Bot validates code** and creates wallet
5. **User clicks login button** to return to web
6. **Session created** with JWT tokens

### Security Features
- User-specific encryption keys
- Time-limited auth codes (5 minutes)
- HMAC signature verification
- Session validation via Redis
- Refresh token rotation

## 📊 Trading Interface

### Buy Panel with Visual Cards
The bot generates professional trading cards showing:
- Token price and market data
- Safety indicators (honeypot, rug score)
- Interactive buy buttons
- Real-time price updates
- Professional gradient backgrounds

### Position Display Images
Custom-generated position cards featuring:
- Current P&L with color indicators
- Entry vs current price comparison
- Hold time and trade count
- Visual profit/loss arrows
- Professional design elements

### P&L Charts
Dynamic chart generation showing:
- Daily performance bars
- Win rate visualization
- Best/worst trade highlights
- Portfolio overview graphics
- Export-ready image format

## 🏗️ Architecture

### Core Components
- **TradingExecutor**: Handles buy/sell execution with safety checks
- **PositionManager**: Real-time position tracking with auto-updates
- **PnLCalculator**: Advanced profit/loss calculations
- **CopyTradeManager**: Intelligent copy trading with risk analysis
- **ImageGenerator**: Professional trading card generation
- **WalletService**: Secure wallet creation and encryption
- **SessionManager**: JWT session management with Redis
- **AuthHandler**: BullX-style Telegram authentication flow

### Database Schema
```sql
-- Users table
users (
  id, telegram_id, username, 
  wallet_address, encrypted_private_key,
  subscription_tier, created_at
)

-- Positions table
positions (
  id, user_id, token_address,
  amount, avg_buy_price, 
  current_price, pnl, created_at
)

-- Trades table
trades (
  id, user_id, token_address,
  type, amount_core, amount_token,
  price, tx_hash, pnl, created_at
)

-- Copy trades table
copy_trades (
  id, user_id, target_wallet,
  settings, enabled, created_at
)
```

## 🔒 Security

### Private Key Encryption
- AES-256-CBC encryption
- User-specific encryption keys
- Secure key derivation
- Never stored in plain text

### Rate Limiting
- 30 requests/minute (free)
- 60 requests/minute (premium)
- 120 requests/minute (pro)

### Transaction Safety
- Simulation before execution
- Max transaction limits
- Confirmation prompts
- Emergency stop functionality

## 🛠️ Development

### Project Structure
```
telegram-bot/
├── src/
│   ├── bot.ts              # Main bot entry
│   ├── auth/               # Authentication
│   ├── wallet/             # Wallet management
│   ├── trading/            # Trading logic
│   ├── alerts/             # Alert system
│   ├── subscription/       # Subscription management
│   ├── middleware/         # Bot middleware
│   ├── services/           # Core services
│   └── utils/              # Utilities
├── package.json
├── tsconfig.json
└── README.md
```

### Testing
```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage
```

### Deployment
```bash
# Build for production
pnpm build

# Docker deployment
docker build -t core-meme-bot .
docker run -d --env-file .env core-meme-bot
```

## 🤝 Integration Points

### Trading Engine
- Connects to UnifiedTradingRouter for optimal execution
- Real-time price feeds from multiple DEXs
- MEV protection with private mempool submission
- Route optimization across liquidity pools

### Blockchain Monitor
- New pair notifications within seconds
- Liquidity event detection for sniping
- Price movement alerts with custom thresholds
- Whale activity tracking with wallet analysis

### Web Platform
- Shared wallet system across platforms
- Unified sessions with JWT synchronization
- Cross-platform settings and preferences
- Real-time sync via WebSocket connections

### Image Generation System
- Canvas-based professional graphics
- Custom fonts and gradient backgrounds
- Real-time data visualization
- Export-ready formats for sharing

## 📈 Performance

- **Response Time**: <1s for commands
- **Trade Execution**: <3s average
- **Price Updates**: Every 30 seconds
- **Session Cache**: 7 days
- **Rate Limits**: Tier-based

## 🚨 Monitoring

### Health Checks
- Bot status endpoint
- Database connectivity
- Redis availability
- API service health

### Logging
- Winston logger integration
- Error tracking
- Trade audit logs
- Performance metrics

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Main Platform](https://corememe.io)
- [Documentation](https://docs.corememe.io)
- [Support](https://t.me/CoreMemeSupport)

## 🏆 Hackathon Highlights

### Innovation Points
1. **BullX-Style Authentication**: Seamless wallet creation through Telegram deep linking
2. **Professional Image Generation**: Custom trading cards like top-tier bots
3. **Copy Trading System**: Follow successful traders with risk analysis
4. **Advanced P&L Tracking**: Comprehensive analytics with visual reports
5. **Multi-DEX Integration**: Optimal routing across Core DEXs

### Technical Excellence
- **Security First**: AES-256-CBC encryption for private keys
- **Real-time Updates**: WebSocket connections for instant data
- **Scalable Architecture**: Microservices with Redis caching
- **Professional UX**: Custom images instead of text-only displays
- **Safety Features**: Honeypot detection and rug score analysis

### Competitive Advantages
- **Full Trading in Telegram**: Unlike BullX's view-only approach
- **Custom Visual Cards**: Professional images like Maestro/Banana Gun
- **Comprehensive Analytics**: Detailed P&L with historical tracking
- **Intelligent Copy Trading**: Risk-based wallet analysis
- **Subscription Model**: Sustainable revenue generation

---

Built with ❤️ for the Core blockchain community