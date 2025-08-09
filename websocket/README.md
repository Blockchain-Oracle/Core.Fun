# Core Meme Platform - WebSocket Server

Real-time data streaming server for the Core Meme Platform.

## Features

- **Real-time Price Updates**: Stream live token prices
- **New Token Alerts**: Instant notifications for new token launches
- **Trade Monitoring**: Live trade feed for specific tokens
- **Custom Alerts**: Price, volume, whale, and rug alerts
- **Scalable Architecture**: Supports 10,000+ concurrent connections
- **Redis Pub/Sub**: Efficient message broadcasting

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Clients   │────▶│  WebSocket   │────▶│    Redis    │
│  (Browser)  │◀────│    Server    │◀────│   Pub/Sub   │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  Core Chain  │
                    │   Provider   │
                    └──────────────┘
```

## Installation

```bash
cd websocket
pnpm install
```

## Configuration

Create a `.env` file:

```env
# Server
WS_PORT=3003
NODE_ENV=development

# Core Blockchain
CORE_RPC_URL=https://rpc.coredao.org
CORE_WS_URL=wss://ws.coredao.org

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

## Running

### Development
```bash
pnpm dev
```

### Production
```bash
pnpm build
pnpm start
```

## WebSocket API

### Connection

Connect to `ws://localhost:3003` (or `wss://` in production)

### Message Format

All messages use JSON format:

```json
{
  "type": "message_type",
  "data": {}
}
```

### Subscription Channels

#### 1. Price Updates

Subscribe to real-time price updates for specific tokens:

```json
{
  "type": "subscribe",
  "channel": "prices",
  "params": {
    "tokens": ["0x123...", "0x456..."]
  }
}
```

Response:
```json
{
  "type": "data",
  "channel": "prices",
  "data": {
    "prices": [{
      "tokenAddress": "0x123...",
      "price": 0.0025,
      "priceChange24h": 15.5,
      "volume24h": 1250000,
      "liquidity": 500000,
      "timestamp": 1234567890
    }]
  }
}
```

#### 2. New Tokens

Subscribe to new token launches:

```json
{
  "type": "subscribe",
  "channel": "tokens",
  "params": {
    "includeRecent": true
  }
}
```

Response:
```json
{
  "type": "data",
  "channel": "tokens",
  "data": {
    "tokens": [{
      "address": "0x789...",
      "name": "Meme Token",
      "symbol": "MEME",
      "totalSupply": "1000000000",
      "creator": "0xabc...",
      "pairAddress": "0xdef...",
      "initialLiquidity": "10000",
      "timestamp": 1234567890,
      "blockNumber": 123456,
      "txHash": "0x..."
    }]
  }
}
```

#### 3. Trade Stream

Subscribe to trades for specific tokens:

```json
{
  "type": "subscribe",
  "channel": "trades",
  "params": {
    "tokens": ["0x123...", "*"]  // "*" for all tokens
  }
}
```

Response:
```json
{
  "type": "data",
  "channel": "trades",
  "data": {
    "trades": [{
      "txHash": "0x...",
      "tokenAddress": "0x123...",
      "tokenSymbol": "MEME",
      "trader": "0xabc...",
      "type": "buy",
      "amountToken": "10000",
      "amountCore": "2.5",
      "price": 0.00025,
      "timestamp": 1234567890,
      "blockNumber": 123456,
      "dex": "ShadowSwap"
    }]
  }
}
```

#### 4. Alerts

Subscribe to various alert types:

```json
{
  "type": "subscribe",
  "channel": "alerts",
  "params": {
    "types": ["price", "whale", "rug", "*"]
  }
}
```

Response:
```json
{
  "type": "data",
  "channel": "alerts",
  "data": {
    "alerts": [{
      "id": "alert_123",
      "type": "whale",
      "tokenAddress": "0x123...",
      "tokenSymbol": "MEME",
      "title": "Whale Alert: MEME",
      "message": "Whale buy: $2.5M of MEME",
      "severity": "warning",
      "data": {
        "walletAddress": "0xabc...",
        "action": "buy",
        "amount": 10000000,
        "value": 2500000
      },
      "timestamp": 1234567890
    }]
  }
}
```

### Unsubscribe

```json
{
  "type": "unsubscribe",
  "channel": "prices"
}
```

### Heartbeat

The server sends ping messages every 30 seconds. Respond with:

```json
{
  "type": "ping"
}
```

Server responds:
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

## Client Example

### JavaScript/TypeScript

```typescript
const ws = new WebSocket('ws://localhost:3003');

ws.on('open', () => {
  console.log('Connected to WebSocket server');
  
  // Subscribe to price updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'prices',
    params: {
      tokens: ['0x123...']
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'connected':
      console.log('Client ID:', message.clientId);
      break;
    case 'data':
      handleData(message.channel, message.data);
      break;
    case 'error':
      console.error('Error:', message.message);
      break;
  }
});

function handleData(channel, data) {
  switch (channel) {
    case 'prices':
      console.log('Price update:', data.prices);
      break;
    case 'trades':
      console.log('New trades:', data.trades);
      break;
    // ... handle other channels
  }
}
```

## Performance

- **Connections**: Supports 10,000+ concurrent WebSocket connections
- **Latency**: <50ms message delivery
- **Throughput**: 100,000+ messages/second
- **Uptime**: 99.9% availability target

## Monitoring

### Health Check

```bash
curl http://localhost:3003/health
```

Response:
```json
{
  "status": "ok",
  "connections": 1234,
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3003
CMD ["npm", "start"]
```

### PM2

```bash
pm2 start dist/index.js --name websocket-server
pm2 save
pm2 startup
```

## Security

- **Rate Limiting**: Max 100 messages/minute per connection
- **Authentication**: JWT tokens for premium features (optional)
- **Input Validation**: All incoming messages validated
- **Connection Limits**: Max connections per IP
- **DDoS Protection**: CloudFlare recommended for production

## Troubleshooting

### Connection Drops
- Check client heartbeat implementation
- Verify network stability
- Review server logs for errors

### Missing Data
- Ensure proper subscription parameters
- Check Redis connectivity
- Verify blockchain RPC availability

### High Latency
- Monitor server resources
- Check Redis performance
- Review connection count

## License

MIT