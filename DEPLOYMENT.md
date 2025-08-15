# Core Meme Platform - Production Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the Core Meme Platform to production.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ and pnpm installed
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)
- Core blockchain RPC access
- Domain name with SSL certificate

## 1. Environment Setup

### 1.1 Clone Repository
```bash
git clone https://github.com/your-org/core-meme-platform.git
cd core-meme-platform
```

### 1.2 Configure Environment Variables
```bash
cp .env.example .env
# Edit .env with your production values
nano .env
```

**Critical variables to configure:**
- `POSTGRES_PASSWORD` - Strong database password
- `CORE_SCAN_API_KEY` - Your Core Scan API key
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `JWT_SECRET` - Random string for JWT signing
- `SESSION_SECRET` - Random string for sessions
- `TREASURY_ADDRESS` - Your treasury wallet address
- `MEME_FACTORY_ADDRESS` - Deployed factory contract address

### 1.3 Generate Secure Secrets
```bash
# Generate random secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For SESSION_SECRET
openssl rand -base64 32  # For INTERNAL_API_KEY
```

## 2. Smart Contract Deployment

### 2.1 Deploy Contracts
```bash
cd contracts
pnpm install
pnpm run compile

# Deploy to Core mainnet
pnpm run deploy:mainnet

# Save the deployed addresses
echo "MEME_FACTORY_ADDRESS=0x..." >> ../.env
```

### 2.2 Verify Contracts
```bash
pnpm run verify:mainnet
```

## 3. Database Setup

### 3.1 Initialize Database
```bash
# Using Docker
docker-compose up -d postgres
docker exec -it core-meme-postgres psql -U core_user -d core_meme_platform

# Run migrations
cd telegram-bot
pnpm run migrate:latest
```

### 3.2 Create Initial Tables
The database will be automatically initialized with required tables on first run.

## 4. Service Deployment

### 4.1 Build and Start Services
```bash
# Build all services
docker-compose build

# Start core services
docker-compose up -d redis postgres api

# Start websocket service
docker-compose up -d websocket

# Start telegram bot (if enabled)
docker-compose up -d telegram-bot

# Start monitoring services
docker-compose up -d blockchain-monitor
```

### 4.2 Verify Services
```bash
# Check service status
docker-compose ps

# Check logs
docker-compose logs -f api
docker-compose logs -f websocket
```

## 5. Security Configuration

### 5.1 Configure Firewall
```bash
# Allow only necessary ports
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 8080/tcp    # WebSocket
ufw enable
```

### 5.2 SSL/TLS Setup (using Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5.3 Security Headers
Configure security headers in `security.config.js` and ensure they're applied.

## 6. Monitoring Setup

### 6.1 Health Checks
```bash
# API health check
curl http://localhost:3001/health

# WebSocket health check
curl http://localhost:8080/health

# Database health check
docker exec core-meme-postgres pg_isready
```

### 6.2 Log Aggregation
```bash
# Create log directory
mkdir -p /var/log/core-meme-platform

# Configure log rotation
cat > /etc/logrotate.d/core-meme-platform << EOF
/var/log/core-meme-platform/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
EOF
```

### 6.3 Monitoring Services
Set up monitoring with your preferred service:
- **Prometheus + Grafana** for metrics
- **Sentry** for error tracking (configure `SENTRY_DSN`)
- **Uptime monitoring** for availability

## 7. Backup Strategy

### 7.1 Database Backups
```bash
# Create backup script
cat > /usr/local/bin/backup-core-meme.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/core-meme-platform"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
docker exec core-meme-postgres pg_dump -U core_user core_meme_platform | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/backup-core-meme.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-core-meme.sh") | crontab -
```

### 7.2 Redis Persistence
Redis is configured with AOF (Append Only File) for persistence.

## 8. Scaling Considerations

### 8.1 Horizontal Scaling
- Use Docker Swarm or Kubernetes for orchestration
- Scale api and websocket services horizontally
- Use Redis Cluster for distributed caching
- Consider PostgreSQL replication for read scaling

### 8.2 Load Balancing
```nginx
upstream api_servers {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

upstream ws_servers {
    ip_hash;  # Sticky sessions for WebSocket
    server localhost:8080;
    server localhost:8081;
}
```

## 9. Maintenance

### 9.1 Updates
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart services
docker-compose build
docker-compose up -d --no-deps api websocket
```

### 9.2 Database Migrations
```bash
cd telegram-bot
pnpm run migrate:latest
```

### 9.3 Emergency Procedures
```bash
# Stop all services
docker-compose stop

# Emergency database backup
docker exec core-meme-postgres pg_dump -U core_user core_meme_platform > emergency_backup.sql

# Restart services
docker-compose start
```

## 10. Telegram Bot Setup

### 10.1 Register Bot
1. Talk to @BotFather on Telegram
2. Create new bot with `/newbot`
3. Save the token to `.env`

### 10.2 Configure Webhook (Optional)
```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/telegram/webhook"}'
```

## 11. Production Checklist

- [ ] Environment variables configured
- [ ] Secrets generated and secured
- [ ] SSL certificates installed
- [ ] Firewall configured
- [ ] Database backed up
- [ ] Monitoring enabled
- [ ] Error tracking configured
- [ ] Rate limiting enabled
- [ ] CORS configured
- [ ] Security headers applied
- [ ] Logs configured with rotation
- [ ] Health checks verified
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

## 12. Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check PostgreSQL status
docker logs core-meme-postgres
# Verify connection string in .env
```

#### WebSocket Connection Issues
```bash
# Check WebSocket logs
docker logs core-websocket
# Verify CORS and proxy configuration
```

#### High Memory Usage
```bash
# Limit container memory
docker-compose down
# Edit docker-compose.yml to add memory limits
# Restart services
docker-compose up -d
```

## Support

For production support:
- Documentation: [docs.core-meme.io](https://docs.core-meme.io)
- Issues: [GitHub Issues](https://github.com/your-org/core-meme-platform/issues)
- Discord: [Join our Discord](https://discord.gg/core-meme)