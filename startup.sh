#!/bin/sh

echo "=== Starting Core Meme Platform ==="
echo "=== Environment Variables ==="
echo "NODE_ENV: $NODE_ENV"
echo "REDIS_URL: $REDIS_URL"
echo "REDIS_HOST: $REDIS_HOST"
echo "DATABASE_URL: $DATABASE_URL"
echo "POSTGRES_HOST: $POSTGRES_HOST"
echo "PORT: $PORT"
echo "API_PORT: $API_PORT"
echo "COOLIFY_URL: $COOLIFY_URL"
echo "COOLIFY_FQDN: $COOLIFY_FQDN"
echo "============================="

# Start PM2 with ecosystem config
exec pm2-runtime start ecosystem.config.js --env production