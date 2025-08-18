# Coolify Deployment Guide for Core Meme Platform

## Overview

This guide provides step-by-step instructions for deploying the Core Meme Platform to Coolify, a self-hosted PaaS alternative to Heroku/Vercel.

## Prerequisites

1. Coolify instance running (v4.0+)
2. GitHub/GitLab repository connected to Coolify
3. Domain name configured (optional but recommended)

## Deployment Steps

### 1. Create New Project in Coolify

1. Log into your Coolify dashboard
2. Click "New Project"
3. Select "Docker Compose" as the deployment type
4. Connect your Git repository

### 2. Configure Build Settings

In the Coolify UI:

1. **Build Pack**: Select "Docker Compose"
2. **Compose File**: Set to `docker-compose.coolify.yml`
3. **Build Context**: Set to `.`
4. **Enable Build Cache**: ✅ Checked

### 3. Set Environment Variables

Navigate to the "Environment Variables" section and add the following:

#### Required Variables

```bash
# Database
POSTGRES_PASSWORD=<generate-secure-password>
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user

# Security
JWT_SECRET=<generate-32-char-secret>
ENCRYPTION_SECRET=<exactly-32-characters>
SIGNATURE_SECRET=<generate-secure-secret>

# Blockchain
NETWORK=testnet
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=<your-factory-address>
TREASURY_ADDRESS=<your-treasury-address>
ADMIN_PRIVATE_KEY=<admin-wallet-private-key>

# Telegram Bot
TELEGRAM_BOT_TOKEN=<bot-token-from-botfather>
TELEGRAM_ADMIN_IDS=<comma-separated-ids>
```

#### Optional Variables

```bash
# Redis
REDIS_PASSWORD=<optional-redis-password>

# CORS (Coolify will auto-set based on domain)
CORS_ORIGINS=${COOLIFY_FQDN}

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Monitoring
MONITOR_INTERVAL_MS=10000
BLOCK_CONFIRMATION_COUNT=3
```

### 4. Configure Domains

1. Go to "Domains" section
2. Add your domain for the frontend: `example.com` → Port 3000
3. Add subdomain for API: `api.example.com` → Port 3001
4. Add subdomain for WebSocket: `ws.example.com` → Port 8081

### 5. Database Configuration

#### Using Coolify's Built-in Databases

1. Go to "Services" → "Add Service"
2. Add PostgreSQL:
   - Version: 15
   - Enable persistence
   - Set backup schedule
3. Add Redis:
   - Version: 7
   - Enable persistence
   - Set max memory to 256MB

#### Using Docker Compose Stack

The `docker-compose.coolify.yml` includes PostgreSQL and Redis services that will be automatically deployed.

### 6. SSL Configuration

Coolify automatically handles SSL certificates via Let's Encrypt:

1. Ensure domains are properly configured
2. Enable "Force HTTPS" in domain settings
3. Certificates will be auto-renewed

### 7. Deploy

1. Click "Deploy" button
2. Monitor build logs in real-time
3. Check health endpoints once deployed

### 8. Post-Deployment

#### Verify Services

Check all services are running:

```bash
# API Health
curl https://api.yourdomain.com/health

# Frontend
curl https://yourdomain.com

# WebSocket
curl https://ws.yourdomain.com/socket.io/
```

#### Database Migrations

If needed, run database migrations:

1. Go to "Terminal" in Coolify
2. Select your app container
3. Run: `npm run migrate` (if you have migration scripts)

#### Set up Telegram Webhook

For production Telegram bot:

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -d "url=https://api.yourdomain.com/telegram/webhook"
```

## Environment-Specific Configurations

### Development

Use the standard `docker-compose.yml` with `.env` file:

```bash
docker-compose up -d
```

### Staging

Create a staging environment in Coolify with different environment variables.

### Production

Use the main deployment with production-grade settings:
- Enable auto-scaling
- Configure backup schedules
- Set up monitoring alerts

## Monitoring and Maintenance

### Health Checks

The platform includes health check endpoints:

- API: `GET /health`
- Frontend: `GET /`
- WebSocket: `GET /socket.io/`

### Logs

Access logs through Coolify UI:
1. Go to your application
2. Click "Logs" tab
3. Filter by service

### Backups

Configure automatic backups:

1. Go to "Backups" in Coolify
2. Set up S3-compatible storage
3. Configure backup schedule
4. Test restore procedure

### Updates

To update the application:

1. Push changes to your Git repository
2. Coolify will auto-detect changes
3. Click "Redeploy" or enable auto-deploy

## Troubleshooting

### Service Won't Start

1. Check environment variables are set correctly
2. Verify database connections
3. Review logs for specific errors

### Database Connection Issues

1. Ensure PostgreSQL and Redis are healthy
2. Check network connectivity between services
3. Verify credentials in environment variables

### High Memory Usage

1. Adjust PM2 max memory restart settings
2. Configure Redis max memory policy
3. Enable container resource limits

### SSL Certificate Issues

1. Verify domain DNS points to Coolify server
2. Check firewall allows ports 80 and 443
3. Review Coolify SSL logs

## Security Best Practices

1. **Never commit secrets** - Use Coolify's environment variables
2. **Enable rate limiting** - Configure RATE_LIMIT_* variables
3. **Use strong passwords** - Generate secure passwords for databases
4. **Regular updates** - Keep dependencies and base images updated
5. **Monitor logs** - Set up alerts for suspicious activity
6. **Backup regularly** - Test restore procedures periodically

## Performance Optimization

1. **Enable build cache** in Coolify
2. **Use multi-stage Docker builds** (already configured)
3. **Configure CDN** for static assets
4. **Enable gzip compression** in Nginx/Caddy
5. **Set up horizontal scaling** for high traffic

## Support

For issues specific to:
- **Coolify**: Check [Coolify Documentation](https://coolify.io/docs)
- **Application**: Review logs and error messages
- **Blockchain**: Verify RPC endpoints and contract addresses

## Quick Commands

### Check Application Status
```bash
# In Coolify terminal
pm2 status
```

### Restart Services
```bash
# Restart all services
pm2 restart all

# Restart specific service
pm2 restart api-server
```

### View Real-time Logs
```bash
# All services
pm2 logs

# Specific service
pm2 logs api-server --lines 100
```

### Database Access
```bash
# PostgreSQL
psql -U core_user -d core_meme_platform

# Redis
redis-cli
```

## Conclusion

Your Core Meme Platform should now be successfully deployed on Coolify with:
- ✅ All services running
- ✅ SSL certificates configured
- ✅ Databases connected
- ✅ Environment variables secured
- ✅ Monitoring enabled
- ✅ Backups configured

For additional help, consult the Coolify documentation or review the application logs.