# 🐳 Docker Deployment Guide

This guide covers deploying the Core Meme Platform using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available
- 20GB+ disk space

## Quick Deploy

### 1. Production Deployment

```bash
# Clone and setup
git clone https://github.com/your-org/core-meme-platform.git
cd core-meme-platform

# Configure environment
cp .env.example .env.production
nano .env.production  # Edit with production values

# Build and deploy
docker-compose --env-file .env.production up -d --build

# Check status
docker-compose ps
docker-compose logs -f
```

### 2. Development Deployment

```bash
# Start only infrastructure
docker-compose up -d postgres redis

# Run services locally
pnpm install
pnpm dev:all
```

## Service Architecture

```yaml
Services:
  ├── postgres (5432)       # Database
  ├── redis (6379)          # Cache & Pub/Sub
  ├── api (3001)            # API Service
  ├── websocket (8081)      # Real-time updates
  ├── blockchain-monitor (3003) # Event monitoring
  └── telegram-bot (3004)   # Telegram interface
```

## Configuration

### Environment Variables

Create `.env.production`:

```bash
# Network
NETWORK=mainnet
NODE_ENV=production

# Database
POSTGRES_PASSWORD=strong_password_here
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user

# Redis
REDIS_PASSWORD=redis_password_here

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
SIGNATURE_SECRET=your_signature_secret
INTERNAL_API_KEY=internal_api_key_here

# Core Blockchain
CORE_RPC_URL=https://rpc.coredao.org
CORE_SCAN_API_KEY=your_api_key

# Smart Contracts
MEME_FACTORY_ADDRESS=0x...
TREASURY_ADDRESS=0x...

# Telegram
TELEGRAM_BOT_TOKEN=bot_token_from_botfather
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook

# Frontend
FRONTEND_URL=https://your-domain.com
```

### Docker Compose Override

For production, create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  postgres:
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./backups:/backups

  redis:
    restart: always
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes

  core-api:
    restart: always
    environment:
      NODE_ENV: production
      LOG_LEVEL: warn
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G

  websocket:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

  trading-engine:
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 1G

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - core-api
      - websocket
```

## Deployment Steps

### 1. Initial Setup

```bash
# Create directories
mkdir -p logs backups nginx/ssl

# Set permissions
chmod 600 .env.production
chmod 755 scripts/*.sh

# Generate SSL certificates (Let's Encrypt)
docker run -it --rm \
  -v $(pwd)/nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d your-domain.com \
  -d api.your-domain.com \
  -d ws.your-domain.com
```

### 2. Database Setup

```bash
# Initialize database
docker-compose up -d postgres
sleep 10

# Run migrations
docker exec -i core-meme-postgres psql -U core_user -d core_meme_platform < docker/init.sql

# Create backup
docker exec core-meme-postgres pg_dump -U core_user core_meme_platform > backups/initial.sql
```

### 3. Build Images

```bash
# Build all services
docker-compose build --parallel

# Or build individually
docker-compose build core-api
docker-compose build websocket
docker-compose build trading-engine
docker-compose build blockchain-monitor
docker-compose build telegram-bot
```

### 4. Deploy Services

```bash
# Start all services
docker-compose --env-file .env.production up -d

# Check logs
docker-compose logs -f

# Monitor resources
docker stats
```

## Health Monitoring

### Health Check Endpoints

```bash
# Check all services
curl http://localhost:3001/health     # API
curl http://localhost:8081/health     # WebSocket
curl http://localhost:3003/health     # Trading Engine

# Database health
docker exec core-meme-postgres pg_isready

# Redis health
docker exec core-meme-redis redis-cli ping
```

### Monitoring Script

```bash
#!/bin/bash
# monitor.sh

while true; do
  clear
  echo "=== Core Meme Platform Status ==="
  docker-compose ps
  echo ""
  echo "=== Resource Usage ==="
  docker stats --no-stream
  echo ""
  echo "=== Recent Logs ==="
  docker-compose logs --tail=5
  sleep 5
done
```

## Scaling

### Horizontal Scaling

```bash
# Scale trading engine
docker-compose up -d --scale trading-engine=3

# Scale with limits
docker-compose up -d \
  --scale trading-engine=3 \
  --scale core-api=2
```

### Load Balancing

Use nginx for load balancing:

```nginx
upstream api_backend {
  least_conn;
  server core-api-1:3001;
  server core-api-2:3001;
  server core-api-3:3001;
}

upstream ws_backend {
  ip_hash;
  server websocket-1:8081;
  server websocket-2:8081;
}

server {
  listen 443 ssl http2;
  server_name api.your-domain.com;

  location / {
    proxy_pass http://api_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}

server {
  listen 443 ssl http2;
  server_name ws.your-domain.com;

  location / {
    proxy_pass http://ws_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

## Backup & Recovery

### Automated Backups

```bash
# backup.sh
#!/bin/bash

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup database
docker exec core-meme-postgres pg_dump -U core_user core_meme_platform > $BACKUP_DIR/db_$TIMESTAMP.sql

# Backup Redis
docker exec core-meme-redis redis-cli --rdb $BACKUP_DIR/redis_$TIMESTAMP.rdb

# Compress
tar -czf $BACKUP_DIR/backup_$TIMESTAMP.tar.gz $BACKUP_DIR/db_$TIMESTAMP.sql $BACKUP_DIR/redis_$TIMESTAMP.rdb

# Clean old backups (keep 30 days)
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/backup_$TIMESTAMP.tar.gz s3://your-backup-bucket/
```

### Recovery

```bash
# Restore database
docker exec -i core-meme-postgres psql -U core_user core_meme_platform < backup.sql

# Restore Redis
docker exec -i core-meme-redis redis-cli --pipe < redis_backup.txt
```

## Security

### Network Isolation

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
  database:
    driver: bridge
    internal: true
```

### Secrets Management

```bash
# Create Docker secrets
echo "your_password" | docker secret create postgres_password -
echo "your_jwt_secret" | docker secret create jwt_secret -

# Use in compose
services:
  postgres:
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
```

### Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw allow 8081/tcp # WebSocket (if direct access needed)
ufw enable
```

## Maintenance

### Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build
docker-compose up -d

# Rolling update
docker-compose up -d --no-deps --build core-api
docker-compose up -d --no-deps --build websocket
```

### Logs Management

```bash
# Configure log rotation
cat > /etc/logrotate.d/docker-core-meme << EOF
/var/lib/docker/containers/*/*.log {
  daily
  rotate 7
  compress
  delaycompress
  missingok
  notifempty
  maxsize 100M
}
EOF

# View logs
docker-compose logs -f --tail=100 [service]

# Clean logs
docker-compose logs --no-color > logs/full.log
> $(docker inspect --format='{{.LogPath}}' container_name)
```

### Cleanup

```bash
# Remove stopped containers
docker-compose rm -f

# Clean unused resources
docker system prune -a --volumes

# Full reset
docker-compose down -v
docker system prune -a --volumes -f
```

## Troubleshooting

### Common Issues

#### Container Keeps Restarting

```bash
# Check logs
docker logs container_name --tail 50

# Check resources
docker stats container_name

# Increase memory limit
docker update --memory 2g container_name
```

#### Database Connection Issues

```bash
# Check network
docker network ls
docker network inspect core-meme-platform_default

# Test connection
docker exec -it core-api ping postgres
```

#### Port Conflicts

```bash
# Find process using port
lsof -i :3001
netstat -tulpn | grep 3001

# Change port in docker-compose.yml
ports:
  - "3002:3001"  # Map to different external port
```

## Performance Tuning

### PostgreSQL

```sql
-- postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
min_wal_size = 1GB
max_wal_size = 4GB
```

### Redis

```conf
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Docker

```json
// daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
```

## Monitoring Stack

### Prometheus + Grafana

```yaml
# monitoring-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3030:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin

  node-exporter:
    image: prom/node-exporter
    ports:
      - "9100:9100"

volumes:
  prometheus-data:
  grafana-data:
```

## Production Checklist

- [ ] SSL certificates configured
- [ ] Environment variables secured
- [ ] Database passwords changed
- [ ] Redis password set
- [ ] Firewall configured
- [ ] Backup system active
- [ ] Monitoring enabled
- [ ] Log rotation configured
- [ ] Health checks passing
- [ ] Load testing completed
- [ ] Security scan passed
- [ ] Documentation updated

## Support

For deployment support:
- Check logs: `docker-compose logs [service]`
- Health status: `./scripts/check-health.sh`
- Documentation: `/docs/deployment`
- Issues: GitHub Issues