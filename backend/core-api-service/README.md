# Core API Integration Service

## 📋 Overview

A high-performance API service for integrating with Core blockchain, providing cached access to token data, transactions, and smart contract information.

## 🚀 Features

- **Token Information**: Get detailed token metadata and statistics
- **Holder Analysis**: Fetch and analyze token holder distributions
- **Transaction History**: Access token transfer history
- **Contract Verification**: Check and submit contract verification
- **Price Data**: Get token pricing from DEXes (coming soon)
- **Redis Caching**: Intelligent caching for improved performance
- **Rate Limiting**: Built-in rate limiting for API protection
- **Health Monitoring**: Health check endpoints for monitoring

## 🛠️ Tech Stack

- **Node.js** with TypeScript
- **Express.js** for REST API
- **Redis** for caching
- **Ethers.js** for blockchain interaction
- **Winston** for logging
- **Zod** for validation
- **Docker** for containerization

## 📦 Installation

### Prerequisites

- Node.js v18+ (v20 recommended)
- Redis server
- pnpm package manager

### Local Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Run in development mode
pnpm dev
```

### Docker Setup

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f core-api

# Stop services
docker-compose down
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CORE_MAINNET_RPC` | Core mainnet RPC URL | `https://rpc.coredao.org` |
| `CORE_TESTNET_RPC` | Core testnet RPC URL | `https://rpc.test.btcs.network` |
| `CORE_SCAN_API_KEY` | Core Scan API key | - |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `CACHE_TTL_DEFAULT` | Default cache TTL (seconds) | `60` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

## 📚 API Documentation

### Base URL

```
http://localhost:3001
```

### Endpoints

#### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "network": "testnet",
  "blockNumber": 12345678,
  "version": "1.0.0"
}
```

#### Token Information

```http
GET /api/token/:address
```

Get detailed information about a token.

Response:
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "name": "Token Name",
    "symbol": "TKN",
    "decimals": 18,
    "totalSupply": "1000000",
    "owner": "0x...",
    "verified": true
  }
}
```

#### Token Holders

```http
GET /api/token/:address/holders?page=1&limit=100
```

Get list of token holders with balances.

Response:
```json
{
  "success": true,
  "data": [
    {
      "address": "0x...",
      "balance": "10000",
      "percentage": 10.5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "count": 100
  }
}
```

#### Token Transactions

```http
GET /api/token/:address/transactions?page=1&limit=100
```

Get token transfer history.

Response:
```json
{
  "success": true,
  "data": [
    {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "value": "1000",
      "blockNumber": 12345,
      "timestamp": 1234567890,
      "status": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "count": 100
  }
}
```

#### Token Price

```http
GET /api/token/:address/price
```

Get token price data from DEXes.

Response:
```json
{
  "success": true,
  "data": {
    "token": "0x...",
    "priceUSD": 0.5,
    "priceCore": 0.001,
    "volume24h": 10000,
    "liquidity": 50000,
    "priceChange24h": 5.5
  }
}
```

#### Contract ABI

```http
GET /api/contract/:address/abi
```

Get contract ABI if verified.

#### Contract Verification

```http
POST /api/contract/verify
```

Submit contract for verification.

Body:
```json
{
  "address": "0x...",
  "sourceCode": "...",
  "contractName": "MyContract",
  "compilerVersion": "v0.8.27",
  "constructorArgs": "..."
}
```

#### Gas Price

```http
GET /api/price/network/gas
```

Get current network gas price.

Response:
```json
{
  "success": true,
  "data": {
    "gasPrice": "35000000000",
    "gasPriceGwei": 35
  }
}
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

## 📊 Performance

- **Caching**: All frequently accessed data is cached in Redis
- **Rate Limiting**: 100 requests per minute per IP
- **Response Time**: <100ms for cached data
- **Concurrent Connections**: Supports 1000+ concurrent connections

## 🔍 Monitoring

### Health Endpoints

- `/health` - Overall health status
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

### Logging

Logs are written to:
- Console (with colors in development)
- `server.log` - General server logs
- `errors.log` - Error logs
- `requests.log` - Request logs

## 🚀 Deployment

### Production Checklist

1. ✅ Set `NODE_ENV=production`
2. ✅ Configure Redis with persistence
3. ✅ Set up SSL/TLS certificates
4. ✅ Configure rate limiting
5. ✅ Set up monitoring (Prometheus/Grafana)
6. ✅ Configure log aggregation
7. ✅ Set up backup strategy for Redis
8. ✅ Configure auto-scaling

### Docker Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  core-api:
    image: core-meme-platform/core-api:latest
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

## 📝 API Response Format

All API responses follow this format:

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "details": [ ... ] // Optional validation errors
}
```

## 🔒 Security

- Input validation using Zod schemas
- Rate limiting per IP
- Helmet.js for security headers
- CORS configuration
- Request logging for audit trail
- No sensitive data in logs

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request