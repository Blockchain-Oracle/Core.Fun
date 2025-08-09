# 🚀 Core Meme Platform Telegram Bot - Quick Start Guide

## Prerequisites

Make sure you have the following installed:
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- pnpm (`npm install -g pnpm`)

## Step 1: Setup Environment

### 1.1 Clone and Install Dependencies
```bash
cd telegram-bot
pnpm install
```

### 1.2 Create Your Telegram Bot
1. Open Telegram and search for @BotFather
2. Send `/newbot` and follow the instructions
3. Save your bot token and username

### 1.3 Setup Environment Variables
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
# Required - Get from BotFather
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_BOT_USERNAME=YourBotName

# Required - Generate secure random strings
JWT_SECRET=generate-a-secure-random-string-here
ENCRYPTION_SECRET=generate-another-secure-random-string-here

# Core Blockchain
CORE_RPC_URL=https://rpc.coredao.org

# Database (will be configured by setup script)
DATABASE_URL=postgresql://postgres@localhost:5432/corememe
REDIS_URL=redis://localhost:6379
```

## Step 2: Database Setup

### 2.1 Start PostgreSQL and Redis
```bash
# macOS
brew services start postgresql
brew services start redis

# Linux
sudo systemctl start postgresql
sudo systemctl start redis
```

### 2.2 Run Setup Script
```bash
# Make script executable
chmod +x scripts/setup.sh

# Run setup
./scripts/setup.sh
```

Or manually:
```bash
# Create database
createdb corememe

# Run migrations
psql -d corememe -f scripts/setup-db.sql
```

## Step 3: Start the Bot

### Development Mode
```bash
pnpm run dev
```

### Production Mode
```bash
pnpm run build
pnpm start
```

## Step 4: Test the Bot

1. Open Telegram and search for your bot username
2. Send `/start` to initialize
3. Your wallet will be created automatically
4. Try these commands:
   - `/wallet` - View your wallet
   - `/balance` - Check balance
   - `/portfolio` - View positions
   - `/help` - See all commands

## 🎯 Features to Test

### Trading
```
/buy 0x... 0.1  - Buy token with 0.1 CORE
/sell 0x... 50   - Sell 50% of position
/portfolio       - View all positions with images
```

### Copy Trading
```
/copy 0x...      - Start copying a wallet
/copysettings    - Configure copy parameters
/copyhistory     - View copied trades
```

### Alerts
```
/track 0x...     - Track a token
/alerts          - Manage price alerts
/watchlist       - View tracked tokens
```

## 🔧 Troubleshooting

### Bot Not Responding
1. Check bot token is correct
2. Verify PostgreSQL and Redis are running
3. Check logs: `tail -f logs/bot.log`

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -d corememe -c "SELECT NOW()"
```

### Redis Connection Failed
```bash
# Check Redis is running
redis-cli ping
```

## 📊 Monitoring

### View Logs
```bash
# Bot logs
tail -f logs/bot.log

# Database queries
tail -f logs/database.log
```

### Check Health
```bash
# Bot status
curl http://localhost:3000/health

# Database status
psql -d corememe -c "SELECT COUNT(*) FROM users"
```

## 🚀 Production Deployment

### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start dist/bot.js --name core-meme-bot

# View logs
pm2 logs core-meme-bot

# Monitor
pm2 monit
```

### Using Docker
```bash
# Build image
docker build -t core-meme-bot .

# Run container
docker run -d \
  --name core-meme-bot \
  --env-file .env \
  --network host \
  core-meme-bot
```

## 📝 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `TELEGRAM_BOT_USERNAME` | ✅ | Bot username without @ |
| `JWT_SECRET` | ✅ | Secret for JWT tokens |
| `ENCRYPTION_SECRET` | ✅ | Secret for wallet encryption |
| `CORE_RPC_URL` | ✅ | Core blockchain RPC endpoint |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `ADMIN_TELEGRAM_ID` | ❌ | Admin Telegram ID for alerts |
| `NODE_ENV` | ❌ | Environment (development/production) |

## 🎨 Key Features

### BullX-Style Authentication
- Auto wallet creation on `/start`
- Deep linking support: `t.me/bot?start=auth_CODE`
- Secure key encryption with AES-256-CBC

### Professional Trading Cards
- Custom position visualizations
- P&L charts with Canvas API
- Portfolio overview images
- Trade result cards

### Advanced Copy Trading
- Follow successful wallets
- Risk management settings
- Blacklist/whitelist tokens
- Stop-loss/take-profit automation

### Real-time Price Feeds
- Direct DEX integration
- 30-second price updates
- Multi-DEX aggregation
- Slippage protection

## 📞 Support

- Telegram: @CoreMemeSupport
- GitHub Issues: [Report Issue](https://github.com/yourusername/core-meme-platform/issues)
- Documentation: [Full Docs](./README.md)

## ✅ Checklist Before Launch

- [ ] Bot token configured
- [ ] Database initialized
- [ ] Redis running
- [ ] Environment variables set
- [ ] Test wallet creation
- [ ] Test trading commands
- [ ] Verify image generation
- [ ] Check error handling
- [ ] Monitor logs
- [ ] Set up backups

Happy Trading! 🚀