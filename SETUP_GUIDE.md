# 🚀 Core Meme Platform - Complete Setup Guide

This guide will walk you through setting up the entire Core Meme Platform ecosystem, connecting all services, and getting everything running together.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Quick Start](#quick-start)
4. [Detailed Service Setup](#detailed-service-setup)
5. [Service Connections](#service-connections)
6. [Environment Configuration](#environment-configuration)
7. [Deployment Options](#deployment-options)
8. [Troubleshooting](#troubleshooting)
9. [Health Checks](#health-checks)

## Prerequisites

### Required Software
- **Node.js** v18+ and **pnpm** v8+
- **Docker** and **Docker Compose** v2+
- **PostgreSQL** 15+ (or use Docker)
- **Redis** 7+ (or use Docker)
- **Git**

### Optional but Recommended
- **Telegram Bot Token** (from @BotFather)
- **Core Blockchain RPC Access**
- **Core Scan API Key**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Web App)                       │
│                        Port: 3000                            │
└──────────────┬────────────────────────┬────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────┐    ┌─────────────────────────┐
│   WebSocket Server   │    │      API Gateway        │
│     Port: 8081       │◄───│       Port: 3001        │
└──────────┬───────────┘    └────────┬────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────────────────────────────────────┐
│                    Redis Cache                        │
│                     Port: 6379                        │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│                PostgreSQL Database                    │
│                    Port: 5432                         │
└──────────────────────────────────────────────────────┘
           ▲            ▲            ▲
           │            │            │
┌──────────┴───┐ ┌──────┴──────┐ ┌─┴──────────────┐
│ Blockchain   │ │   Trading   │ │  Telegram Bot  │
│  Monitor     │ │   Engine    │ │   Port: 3002   │
│ (Background) │ │  Port: 3003 │ └────────────────┘
└──────────────┘ └─────────────┘
```

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/core-meme-platform.git
cd core-meme-platform

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your values:

```bash
# Essential Configuration
NETWORK=testnet                    # or mainnet
POSTGRES_PASSWORD=your_secure_pass
JWT_SECRET=your_jwt_secret_here
TELEGRAM_BOT_TOKEN=your_bot_token  # Get from @BotFather

# Core Blockchain
CORE_RPC_URL=https://rpc.test2.btcs.network  # Testnet
# CORE_RPC_URL=https://rpc.coredao.org       # Mainnet

# Contract Addresses (Deploy first or use existing)
MEME_FACTORY_ADDRESS=0x...
TREASURY_ADDRESS=0x...
```

### 3. Start Services

#### Option A: Docker Compose (Recommended for Production)

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Option B: Local Development

```bash
# Start infrastructure
docker-compose up -d postgres redis

# Start all services in development mode
pnpm dev:all

# Or start individually:
pnpm --filter @core-meme/api dev
pnpm --filter @core-meme/websocket dev
pnpm --filter @core-meme/trading-engine dev
pnpm --filter @core-meme/blockchain-monitor dev
pnpm --filter @core-meme/telegram-bot dev
```

## Detailed Service Setup

### 1. Database Setup

```bash
# Using Docker
docker-compose up -d postgres

# Manual setup
psql -U postgres
CREATE DATABASE core_meme_platform;
CREATE USER core_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE core_meme_platform TO core_user;

# Run migrations
pnpm db:migrate
```

### 2. Redis Cache Setup

```bash
# Using Docker
docker-compose up -d redis

# Test connection
redis-cli ping
# Should return: PONG
```

### 3. API Gateway (Port 3001)

The main REST API that other services connect to.

```bash
cd backend/api
cp .env.example .env
# Edit .env with your configuration

# Development
pnpm dev

# Production
pnpm build && pnpm start
```

**Key Endpoints:**
- `GET /health` - Health check
- `POST /api/tokens` - Create token
- `GET /api/tokens` - List tokens
- `GET /api/prices` - Get price data
- `POST /api/trade` - Execute trade

### 4. WebSocket Server (Port 8081)

Real-time data streaming for prices, trades, and alerts.

```bash
cd websocket
cp .env.example .env

# Configuration
WS_PORT=8081
REDIS_HOST=localhost
POSTGRES_HOST=localhost

# Start
pnpm dev
```

**Channels:**
- `price:TOKEN_ADDRESS` - Real-time price updates
- `trades:TOKEN_ADDRESS` - Live trades
- `alerts:USER_ID` - User alerts
- `new_tokens` - New token launches

### 5. Trading Engine (Port 3003)

Handles DEX interactions and trade execution.

```bash
cd backend/trading-engine
cp .env.example .env

# Critical settings
MIN_TRADE_AMOUNT=0.001
MAX_SLIPPAGE=0.05
DEFAULT_GAS_PRICE=5  # Gwei

# Start
pnpm dev
```

### 6. Blockchain Monitor

Monitors blockchain for events and updates database.

```bash
cd backend/blockchain-monitor
cp .env.example .env

# Configuration
BLOCK_SCAN_INTERVAL=5000  # 5 seconds
START_BLOCK=latest        # or specific block number

# Start
pnpm dev
```

### 7. Core API Service

Wrapper for Core blockchain interactions.

```bash
cd backend/core-api-service
cp .env.example .env

# Configuration
CORE_RPC_URL=https://rpc.test2.btcs.network
CORE_SCAN_API_KEY=your_api_key  # Optional but recommended

# Start
pnpm dev
```

### 8. Telegram Bot (Port 3002 for webhooks)

```bash
cd telegram-bot
cp .env.example .env

# Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
ADMIN_TELEGRAM_IDS=123456789,987654321

# WebSocket connection
WEBSOCKET_URL=ws://localhost:8081

# Trading Engine connection
TRADING_ENGINE_URL=http://localhost:3003

# Start
pnpm dev

# Set webhook (production)
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$TELEGRAM_WEBHOOK_URL"
```

## Service Connections

### Connection Matrix

| Service | Connects To | Port | Purpose |
|---------|------------|------|---------|
| **Web App** | API Gateway, WebSocket | 3001, 8081 | Data & real-time updates |
| **API Gateway** | PostgreSQL, Redis, All Services | 5432, 6379 | Central hub |
| **WebSocket** | Redis, PostgreSQL | 6379, 5432 | Real-time data |
| **Trading Engine** | Core RPC, DEX Contracts | - | Execute trades |
| **Blockchain Monitor** | Core RPC, PostgreSQL | - | Track events |
| **Telegram Bot** | WebSocket, Trading Engine, API | 8081, 3003, 3001 | User interface |

### Internal Communication

```javascript
// Example: Telegram Bot connecting to WebSocket
const ws = new WebSocket('ws://localhost:8081');

ws.on('open', () => {
  // Subscribe to channels
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'new_tokens'
  }));
});

// Example: API calling Trading Engine
const response = await fetch('http://localhost:3003/api/trade/buy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.INTERNAL_API_KEY
  },
  body: JSON.stringify({
    tokenAddress: '0x...',
    amount: '1.0',
    slippage: 0.01
  })
});
```

## Environment Configuration

### Critical Environment Variables

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Network
NETWORK=testnet  # or mainnet

# Core Blockchain
CORE_RPC_URL=https://rpc.test2.btcs.network
CORE_SCAN_API_KEY=your_api_key

# Security
JWT_SECRET=your_jwt_secret
INTERNAL_API_KEY=internal_service_key

# Smart Contracts
MEME_FACTORY_ADDRESS=0x...
TREASURY_ADDRESS=0x...

# Service URLs (for production)
API_URL=https://api.corememe.io
WEBSOCKET_URL=wss://ws.corememe.io
FRONTEND_URL=https://corememe.io
```

### Service-Specific Ports

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Web App | 3000 | `PORT` |
| API Gateway | 3001 | `API_PORT` |
| Telegram Webhook | 3002 | `WEBHOOK_PORT` |
| Trading Engine | 3003 | `TRADING_ENGINE_PORT` |
| WebSocket | 8081 | `WS_PORT` |
| PostgreSQL | 5432 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |

## Deployment Options

### Development

```bash
# Start everything locally
./scripts/start-dev.sh

# Or manually:
docker-compose up -d postgres redis
pnpm dev:all
```

### Production with Docker

```bash
# Build all images
docker-compose build

# Start with production config
docker-compose --env-file .env.production up -d

# Scale services
docker-compose up -d --scale trading-engine=3
```

### Production with PM2

```bash
# Install PM2
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

### Kubernetes Deployment

```bash
# Apply configurations
kubectl apply -f k8s/

# Check status
kubectl get pods -n core-meme

# Scale
kubectl scale deployment trading-engine --replicas=3 -n core-meme
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U core_user -d core_meme_platform

# Check logs
docker logs core-meme-postgres
```

#### 2. Redis Connection Failed
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping

# Check logs
docker logs core-meme-redis
```

#### 3. WebSocket Not Connecting
```bash
# Check if port is open
netstat -an | grep 8081

# Test WebSocket
wscat -c ws://localhost:8081

# Check firewall
sudo ufw status
```

#### 4. Telegram Bot Not Responding
```bash
# Check webhook
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo

# Test bot token
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe

# Check logs
docker logs core-telegram-bot
```

#### 5. Trading Engine Errors
```bash
# Check RPC connection
curl -X POST $CORE_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check gas prices
curl -X POST $CORE_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}'
```

## Health Checks

### Service Health Endpoints

```bash
# API Gateway
curl http://localhost:3001/health

# WebSocket
curl http://localhost:8081/health

# Trading Engine
curl http://localhost:3003/health

# Telegram Bot
curl http://localhost:3002/health
```

### Complete System Check

```bash
# Run health check script
./scripts/check-health.sh

# Expected output:
✅ PostgreSQL: Connected
✅ Redis: Connected
✅ API Gateway: Healthy
✅ WebSocket: Healthy
✅ Trading Engine: Healthy
✅ Blockchain Monitor: Running
✅ Telegram Bot: Active
✅ System Status: All services operational
```

### Monitoring Dashboard

Access the monitoring dashboard at `http://localhost:3001/admin/dashboard` (requires admin authentication).

## Logs

### View Logs

```bash
# Docker logs
docker-compose logs -f [service-name]

# File logs
tail -f logs/*.log

# PM2 logs
pm2 logs [service-name]
```

### Log Levels

Set `LOG_LEVEL` in `.env`:
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

## Security Checklist

- [ ] Change all default passwords
- [ ] Generate secure JWT_SECRET
- [ ] Set up HTTPS/WSS for production
- [ ] Configure firewall rules
- [ ] Enable rate limiting
- [ ] Set up monitoring alerts
- [ ] Regular security updates
- [ ] Backup database regularly

## Next Steps

1. **Deploy Smart Contracts** - See `/contracts/README.md`
2. **Configure Telegram Bot** - See `/telegram-bot/SETUP.md`
3. **Set Up Frontend** - See `/web-app/README.md`
4. **Configure Monitoring** - Set up Grafana/Prometheus
5. **SSL Certificates** - Use Let's Encrypt for HTTPS

## Support

- **Documentation**: `/docs`
- **Issues**: GitHub Issues
- **Discord**: [Join our Discord](#)
- **Email**: support@corememe.io

---

## Quick Commands Reference

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# Restart a service
docker-compose restart [service-name]

# View logs
docker-compose logs -f [service-name]

# Database backup
pg_dump -h localhost -U core_user core_meme_platform > backup.sql

# Database restore
psql -h localhost -U core_user core_meme_platform < backup.sql

# Clear Redis cache
redis-cli FLUSHALL

# Update all services
git pull && pnpm install && docker-compose build

# Production deployment
./scripts/deploy-production.sh
```