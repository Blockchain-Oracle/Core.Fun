# 🤖 Telegram Bot Setup Guide

## Prerequisites

- Node.js 16+
- Telegram Bot Token from [@BotFather](https://t.me/botfather)
- PostgreSQL and Redis running
- Core blockchain RPC endpoint

## Quick Start

### 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Choose a name for your bot (e.g., "Core Meme Trading Bot")
4. Choose a username (must end with 'bot', e.g., "CoreMemeTradingBot")
5. Copy the bot token (looks like: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure Environment

```bash
cd telegram-bot
cp .env.example .env
```

Edit `.env`:
```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
TELEGRAM_WEBHOOK_SECRET=random_secret_string_here

# Database
DATABASE_URL=postgresql://core_user:password@localhost:5432/core_meme_platform

# Redis
REDIS_URL=redis://localhost:6379

# Core Blockchain
CORE_RPC_URL=https://rpc.coredao.org
NETWORK=mainnet

# Services
API_URL=http://localhost:3001
WEBSOCKET_URL=ws://localhost:8081

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
SIGNATURE_SECRET=your_signature_secret
ENCRYPTION_KEY=32_char_encryption_key_for_wallets
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Build & Run

#### Development Mode
```bash
# Run with hot reload
pnpm dev

# Run with debugging
DEBUG=bot:* pnpm dev
```

#### Production Mode
```bash
# Build
pnpm build

# Run
pnpm start

# Or with PM2
pm2 start dist/bot.js --name telegram-bot
```

## Bot Commands Setup

### Configure Commands in BotFather

Send these commands to [@BotFather](https://t.me/botfather):

1. Select your bot
2. Send `/setcommands`
3. Paste this list:

```
start - Start the bot and create wallet
help - Show help message
wallet - View wallet info and balance
buy - Buy a token (usage: /buy TOKEN_ADDRESS AMOUNT_CORE)
sell - Sell a token (usage: /sell TOKEN_ADDRESS AMOUNT_TOKEN)
portfolio - View your portfolio
positions - View active positions
trades - View recent trades
track - Track a token (usage: /track TOKEN_ADDRESS)
untrack - Stop tracking a token
alerts - Manage price alerts
settings - Bot settings
subscribe - Upgrade subscription
referral - Get referral link
stats - View trading statistics
leaderboard - View top traders
gas - Check current gas prices
```

### Enable Inline Mode (Optional)

1. Send `/setinline` to [@BotFather](https://t.me/botfather)
2. Enable inline mode
3. Set placeholder text: "Search tokens..."

### Configure Bot Settings

1. Send `/mybots` to [@BotFather](https://t.me/botfather)
2. Select your bot
3. Configure:
   - Description: Set bot description
   - About: Set about text
   - Profile Picture: Upload bot avatar
   - Inline Feedback: 100% (if using inline mode)

## Webhook Setup

### Local Development (ngrok)

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3002

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update TELEGRAM_WEBHOOK_URL in .env
```

### Production Setup

1. **Configure Nginx**:

```nginx
server {
    listen 443 ssl;
    server_name bot.your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location /webhook {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

2. **Set Webhook**:

```bash
# The bot will automatically set the webhook on startup
# Or manually:
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${TELEGRAM_WEBHOOK_URL}\", \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\"}"
```

## Features Configuration

### 1. Wallet Generation

The bot automatically generates a wallet for each user on `/start`. To customize:

```typescript
// src/services/WalletService.ts
const wallet = await this.createWallet(userId, {
  derivationPath: "m/44'/60'/0'/0/0",  // Custom derivation path
  encryptionStrength: 256,              // Encryption strength
});
```

### 2. Trading Limits

Configure in `src/config/limits.ts`:

```typescript
export const TRADING_LIMITS = {
  MIN_BUY_CORE: 0.1,       // Minimum buy amount
  MAX_BUY_CORE: 1000,      // Maximum buy amount
  MIN_SELL_PERCENTAGE: 10, // Minimum sell percentage
  MAX_SLIPPAGE: 5,         // Maximum slippage %
  DEFAULT_SLIPPAGE: 1,     // Default slippage %
};
```

### 3. Subscription Tiers

Configure in `src/config/subscriptions.ts`:

```typescript
export const SUBSCRIPTION_TIERS = {
  free: {
    maxAlerts: 5,
    maxTrackedTokens: 10,
    tradeFee: 0.01, // 1%
  },
  premium: {
    maxAlerts: 50,
    maxTrackedTokens: 100,
    tradeFee: 0.005, // 0.5%
    price: 10, // CORE per month
  },
  whale: {
    maxAlerts: 1000,
    maxTrackedTokens: 1000,
    tradeFee: 0.002, // 0.2%
    price: 50, // CORE per month
  },
};
```

### 4. Alert Types

Configure in `src/config/alerts.ts`:

```typescript
export const ALERT_TYPES = {
  PRICE_ABOVE: 'price_above',
  PRICE_BELOW: 'price_below',
  VOLUME_SPIKE: 'volume_spike',
  LIQUIDITY_ADDED: 'liquidity_added',
  LIQUIDITY_REMOVED: 'liquidity_removed',
  RUG_PULL_WARNING: 'rug_pull_warning',
  NEW_TOKEN: 'new_token',
  WHALE_TRADE: 'whale_trade',
};
```

## Monitoring

### Health Check

```bash
# Check bot status
curl http://localhost:3002/health

# Response:
{
  "status": "healthy",
  "uptime": 3600,
  "telegram": "connected",
  "database": "connected",
  "redis": "connected",
  "websocket": "connected"
}
```

### Logs

```bash
# View logs
tail -f logs/telegram-bot.log

# View errors only
tail -f logs/telegram-bot.log | grep ERROR

# With PM2
pm2 logs telegram-bot
```

### Metrics

The bot exposes metrics at `/metrics`:

```bash
curl http://localhost:3002/metrics

# Metrics include:
- Total users
- Active users (24h)
- Total trades
- Total volume
- Commands processed
- Errors count
- Response times
```

## Testing

### 1. Unit Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test
pnpm test -- WalletService
```

### 2. Integration Tests

```bash
# Test bot commands
pnpm test:integration

# Test with real Telegram API (requires test token)
TELEGRAM_TEST_TOKEN=test_token pnpm test:e2e
```

### 3. Manual Testing

1. Start bot in dev mode
2. Open Telegram
3. Search for your bot username
4. Test commands:
   - `/start` - Should create wallet
   - `/wallet` - Should show wallet info
   - `/help` - Should show help
   - `/buy 0x... 1` - Should simulate buy
   - `/portfolio` - Should show empty portfolio

## Troubleshooting

### Bot Not Responding

```bash
# Check webhook status
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Check bot info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Delete webhook (for polling mode)
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Check if tables exist
psql $DATABASE_URL -c "\dt"
```

### WebSocket Connection Issues

```bash
# Test WebSocket connection
wscat -c ws://localhost:8081

# Send test message
{"type": "ping"}
```

### Common Errors

1. **"Unauthorized" error**
   - Check bot token is correct
   - Ensure token has no extra spaces

2. **"Webhook URL must be HTTPS"**
   - Use ngrok for local development
   - Ensure SSL certificate is valid for production

3. **"Too Many Requests" error**
   - Implement rate limiting
   - Use message queues for bulk operations

4. **"Connection timeout" error**
   - Check firewall settings
   - Ensure services are running
   - Check network connectivity

## Security Best Practices

1. **Never expose bot token**
   ```bash
   # Use environment variables
   TELEGRAM_BOT_TOKEN=your_token
   
   # Never commit .env files
   echo ".env" >> .gitignore
   ```

2. **Validate webhook requests**
   ```typescript
   // Verify secret token
   if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
     return res.status(401).send('Unauthorized');
   }
   ```

3. **Encrypt sensitive data**
   ```typescript
   // Wallet private keys are always encrypted
   const encrypted = encrypt(privateKey, ENCRYPTION_KEY);
   ```

4. **Rate limiting**
   ```typescript
   // Implement per-user rate limits
   const limiter = rateLimit({
     windowMs: 60 * 1000, // 1 minute
     max: 30, // 30 requests per minute
   });
   ```

5. **Input validation**
   ```typescript
   // Validate addresses
   if (!ethers.isAddress(tokenAddress)) {
     throw new Error('Invalid token address');
   }
   ```

## Performance Optimization

1. **Use Redis caching**
   ```typescript
   // Cache frequently accessed data
   await redis.setex(`user:${userId}`, 300, JSON.stringify(userData));
   ```

2. **Batch database queries**
   ```typescript
   // Use transactions for multiple operations
   await db.transaction(async (trx) => {
     await trx('users').update(...);
     await trx('trades').insert(...);
   });
   ```

3. **Implement message queues**
   ```typescript
   // Use Bull for job processing
   await queue.add('send-alert', { userId, message });
   ```

4. **Optimize image generation**
   ```typescript
   // Use canvas pooling
   const canvas = await canvasPool.acquire();
   // ... generate image
   canvasPool.release(canvas);
   ```

## Maintenance

### Daily Tasks
- Monitor error logs
- Check webhook status
- Review metrics

### Weekly Tasks
- Analyze user engagement
- Review performance metrics
- Update tracked tokens

### Monthly Tasks
- Database cleanup
- Log rotation
- Security audit
- Update dependencies

## Support

For issues or questions:
- Check logs: `logs/telegram-bot.log`
- Debug mode: `DEBUG=bot:* pnpm dev`
- Documentation: `/docs/telegram-bot`
- GitHub Issues: [Create Issue](https://github.com/your-org/core-meme-platform/issues)