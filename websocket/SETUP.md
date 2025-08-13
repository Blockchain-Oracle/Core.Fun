# 🔌 WebSocket Server Setup Guide

## Overview

The WebSocket server provides real-time data streaming for:
- Live price updates
- Trade events
- New token alerts
- Portfolio changes
- System notifications

## Prerequisites

- Node.js 16+
- Redis running on port 6379
- PostgreSQL running on port 5432

## Quick Start

### 1. Configure Environment

```bash
cd websocket
cp .env.example .env
```

Edit `.env`:
```env
# Server Configuration
PORT=8081
NODE_ENV=production

# Database
DATABASE_URL=postgresql://core_user:password@localhost:5432/core_meme_platform

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
CORS_ORIGIN=https://your-frontend.com,http://localhost:3000

# Rate Limiting
MAX_CONNECTIONS_PER_IP=10
MAX_MESSAGES_PER_MINUTE=100

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9091
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build & Run

#### Development Mode
```bash
# Run with hot reload
pnpm dev

# Run with debugging
DEBUG=ws:* pnpm dev
```

#### Production Mode
```bash
# Build
pnpm build

# Run
pnpm start

# Or with PM2
pm2 start dist/server.js --name websocket-server
```

## Client Connection

### JavaScript/TypeScript Client

```typescript
import { io } from 'socket.io-client';

// Connect to WebSocket server
const socket = io('ws://localhost:8081', {
  auth: {
    token: 'YOUR_JWT_TOKEN', // Optional authentication
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Subscribe to channels
socket.emit('subscribe', {
  channel: 'price',
  params: {
    tokens: ['0x...', '0x...'], // Token addresses to track
    interval: 1000, // Update interval in ms
  },
});

// Listen for price updates
socket.on('price:update', (data) => {
  console.log('Price update:', data);
  // {
  //   token: '0x...',
  //   price: 0.001,
  //   change24h: 15.5,
  //   volume: 100000,
  //   timestamp: 1234567890
  // }
});

// Subscribe to trade events
socket.emit('subscribe', {
  channel: 'trades',
  params: {
    tokens: ['0x...'], // Optional: filter by tokens
  },
});

socket.on('trade:new', (data) => {
  console.log('New trade:', data);
  // {
  //   token: '0x...',
  //   type: 'buy',
  //   amount: 1000,
  //   price: 0.001,
  //   trader: '0x...',
  //   txHash: '0x...',
  //   timestamp: 1234567890
  // }
});

// Unsubscribe from channel
socket.emit('unsubscribe', {
  channel: 'price',
  params: {
    tokens: ['0x...'],
  },
});
```

### Python Client

```python
import socketio

# Create client
sio = socketio.Client()

# Event handlers
@sio.event
def connect():
    print('Connected to WebSocket server')
    # Subscribe to price updates
    sio.emit('subscribe', {
        'channel': 'price',
        'params': {
            'tokens': ['0x...'],
            'interval': 1000
        }
    })

@sio.event
def disconnect():
    print('Disconnected from server')

@sio.on('price:update')
def on_price_update(data):
    print(f"Price update: {data}")

# Connect
sio.connect('ws://localhost:8081', auth={'token': 'YOUR_JWT_TOKEN'})

# Keep connection alive
sio.wait()
```

### WebSocket Native Client

```javascript
// Native WebSocket (limited features)
const ws = new WebSocket('ws://localhost:8081/raw');

ws.onopen = () => {
  console.log('Connected');
  
  // Send subscription message
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'price',
    params: {
      tokens: ['0x...'],
    },
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Connection closed');
};
```

## Available Channels

### 1. Price Updates

```typescript
// Subscribe
socket.emit('subscribe', {
  channel: 'price',
  params: {
    tokens: ['0x...'], // Token addresses
    interval: 1000,    // Update interval (ms)
  },
});

// Events
socket.on('price:update', (data) => {
  // Individual price update
});

socket.on('price:batch', (data) => {
  // Batch price updates
});
```

### 2. Trade Events

```typescript
// Subscribe
socket.emit('subscribe', {
  channel: 'trades',
  params: {
    tokens: ['0x...'],  // Optional: filter by tokens
    minAmount: 100,     // Optional: minimum trade amount
  },
});

// Events
socket.on('trade:new', (data) => {
  // New trade executed
});

socket.on('trade:large', (data) => {
  // Whale trade alert
});
```

### 3. New Tokens

```typescript
// Subscribe
socket.emit('subscribe', {
  channel: 'tokens',
  params: {
    includeRugCheck: true, // Include rug score
  },
});

// Events
socket.on('token:new', (data) => {
  // New token created
});

socket.on('token:verified', (data) => {
  // Token verified safe
});
```

### 4. Liquidity Events

```typescript
// Subscribe
socket.emit('subscribe', {
  channel: 'liquidity',
  params: {
    tokens: ['0x...'],
  },
});

// Events
socket.on('liquidity:added', (data) => {
  // Liquidity added
});

socket.on('liquidity:removed', (data) => {
  // Liquidity removed
});
```

### 5. User Notifications

```typescript
// Subscribe (requires authentication)
socket.emit('subscribe', {
  channel: 'notifications',
});

// Events
socket.on('notification:alert', (data) => {
  // Price alert triggered
});

socket.on('notification:trade', (data) => {
  // Trade executed
});

socket.on('notification:system', (data) => {
  // System message
});
```

## Authentication

### JWT Authentication

```typescript
// Client-side
const socket = io('ws://localhost:8081', {
  auth: {
    token: localStorage.getItem('jwt_token'),
  },
});

// Server validates token
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.userId;
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});
```

### API Key Authentication

```typescript
// Client-side
const socket = io('ws://localhost:8081', {
  auth: {
    apiKey: 'your_api_key',
  },
});
```

## Load Balancing

### Nginx Configuration

```nginx
upstream websocket_backend {
    ip_hash;  # Important for WebSocket sticky sessions
    server localhost:8081;
    server localhost:8082;
    server localhost:8083;
}

server {
    listen 443 ssl;
    server_name ws.your-domain.com;

    location /socket.io/ {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### Horizontal Scaling with Redis Adapter

```typescript
// Enable Redis adapter for multi-instance
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = redis.createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Monitoring

### Health Check

```bash
# Check server health
curl http://localhost:8081/health

# Response:
{
  "status": "healthy",
  "connections": 150,
  "uptime": 3600,
  "memory": {
    "used": 50,
    "total": 512
  },
  "redis": "connected",
  "database": "connected"
}
```

### Metrics Endpoint

```bash
# Prometheus metrics
curl http://localhost:9091/metrics

# Metrics include:
ws_connections_total
ws_messages_sent_total
ws_messages_received_total
ws_subscriptions_active
ws_errors_total
ws_latency_histogram
```

### Connection Statistics

```bash
# Get current connections
curl http://localhost:8081/stats

# Response:
{
  "totalConnections": 150,
  "authenticatedConnections": 100,
  "connectionsByChannel": {
    "price": 120,
    "trades": 80,
    "tokens": 50
  },
  "messagesPerSecond": 500,
  "bandwidthUsage": "1.2 MB/s"
}
```

## Performance Optimization

### 1. Connection Pooling

```typescript
// Configure connection limits
const io = new Server({
  maxHttpBufferSize: 1e6,     // 1MB
  pingTimeout: 60000,          // 60 seconds
  pingInterval: 25000,         // 25 seconds
  upgradeTimeout: 10000,       // 10 seconds
  perMessageDeflate: {
    threshold: 1024,           // Compress messages > 1KB
  },
});
```

### 2. Message Batching

```typescript
// Batch multiple updates
const batch = [];
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 100; // ms

setInterval(() => {
  if (batch.length > 0) {
    io.emit('price:batch', batch);
    batch.length = 0;
  }
}, BATCH_INTERVAL);
```

### 3. Room Management

```typescript
// Use rooms for efficient broadcasting
socket.join(`token:${tokenAddress}`);
socket.join(`user:${userId}`);

// Broadcast to specific room
io.to(`token:${tokenAddress}`).emit('price:update', data);
```

### 4. Memory Management

```typescript
// Clean up inactive connections
setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    if (socket.disconnected) {
      socket.disconnect(true);
    }
  });
}, 60000); // Every minute
```

## Troubleshooting

### Connection Issues

```bash
# Test WebSocket connection
wscat -c ws://localhost:8081/socket.io/?EIO=4&transport=websocket

# Check if port is open
nc -zv localhost 8081

# Check firewall
sudo ufw status | grep 8081
```

### Memory Leaks

```bash
# Monitor memory usage
node --inspect dist/server.js

# Use Chrome DevTools
chrome://inspect

# Heap snapshot
kill -USR2 <PID>
```

### High CPU Usage

```bash
# Profile CPU usage
node --prof dist/server.js

# Process profiling data
node --prof-process isolate-*.log > profile.txt
```

### Common Errors

1. **"Transport unknown" error**
   ```typescript
   // Ensure transport is specified
   const socket = io('ws://localhost:8081', {
     transports: ['websocket', 'polling'],
   });
   ```

2. **"Connection timeout" error**
   ```typescript
   // Increase timeout
   const socket = io('ws://localhost:8081', {
     timeout: 20000, // 20 seconds
   });
   ```

3. **"Too many connections" error**
   ```typescript
   // Implement rate limiting
   const connections = new Map();
   io.on('connection', (socket) => {
     const ip = socket.handshake.address;
     if (connections.get(ip) > MAX_CONNECTIONS_PER_IP) {
       socket.disconnect();
       return;
     }
   });
   ```

## Security Best Practices

1. **Validate input**
   ```typescript
   socket.on('subscribe', (data) => {
     if (!isValidChannel(data.channel)) {
       socket.emit('error', 'Invalid channel');
       return;
     }
   });
   ```

2. **Rate limiting**
   ```typescript
   const rateLimiter = new RateLimiter({
     points: 100,
     duration: 60,
   });
   
   socket.use(async ([event, ...args], next) => {
     try {
       await rateLimiter.consume(socket.id);
       next();
     } catch {
       next(new Error('Rate limit exceeded'));
     }
   });
   ```

3. **CORS configuration**
   ```typescript
   const io = new Server({
     cors: {
       origin: process.env.CORS_ORIGIN?.split(','),
       credentials: true,
     },
   });
   ```

4. **Message validation**
   ```typescript
   socket.on('message', (data) => {
     const schema = Joi.object({
       type: Joi.string().required(),
       payload: Joi.object(),
     });
     
     const { error } = schema.validate(data);
     if (error) {
       socket.emit('error', 'Invalid message format');
       return;
     }
   });
   ```

## Testing

### Unit Tests

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run tests/load-test.yml
```

Example `load-test.yml`:
```yaml
config:
  target: "ws://localhost:8081"
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 100
  engines:
    socketio-v3: {}

scenarios:
  - name: "Subscribe to prices"
    engine: socketio-v3
    flow:
      - emit:
          channel: "subscribe"
          data:
            channel: "price"
            params:
              tokens: ["0x..."]
      - think: 30
      - emit:
          channel: "unsubscribe"
          data:
            channel: "price"
```

## Maintenance

### Log Rotation

```bash
# Configure logrotate
cat > /etc/logrotate.d/websocket << EOF
/var/log/websocket/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  create 0644 node node
}
EOF
```

### Backup & Recovery

```bash
# Backup connection state
redis-cli --rdb websocket-state.rdb

# Restore state
redis-cli --pipe < websocket-state.rdb
```

## Support

For issues or questions:
- Check logs: `logs/websocket.log`
- Debug mode: `DEBUG=ws:* pnpm dev`
- Documentation: `/docs/websocket`
- GitHub Issues: [Create Issue](https://github.com/your-org/core-meme-platform/issues)