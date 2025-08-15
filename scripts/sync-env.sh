#!/bin/bash

# Sync Environment Files Script
# This script ensures all service environment files are consistent

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 Syncing Environment Files${NC}"
echo "================================"

# Check if unified env exists
if [ ! -f .env.unified ]; then
    echo -e "${RED}❌ .env.unified not found!${NC}"
    echo "Please create .env.unified first"
    exit 1
fi

# Backup existing env files
echo -e "${YELLOW}📦 Backing up existing .env files...${NC}"
for file in .env backend/api/.env backend/blockchain-monitor/.env telegram-bot/.env backend/websocket/.env; do
    if [ -f "$file" ]; then
        cp "$file" "$file.backup.$(date +%Y%m%d_%H%M%S)"
        echo "  Backed up: $file"
    fi
done

# Copy unified env to main .env
echo -e "\n${YELLOW}📝 Creating main .env...${NC}"
cp .env.unified .env
echo -e "${GREEN}✅ Created .env${NC}"

# Create backend/api/.env
echo -e "\n${YELLOW}📝 Creating backend/api/.env...${NC}"
cat > backend/api/.env << 'EOF'
# Backend API Service Environment
# Auto-generated from .env.unified

NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://core_user:core_secure_pass_2024@localhost:5432/core_meme_platform
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Core Blockchain
NETWORK=testnet
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784
TREASURY_ADDRESS=0xe397a72377F43645Cd4DA02d709c378df6e9eE5a

# Security
JWT_SECRET=core_meme_platform_jwt_secret_2024_strong_key_min_32_chars
JWT_EXPIRES_IN=7d
ENCRYPTION_SECRET=core_meme_encryption_secret_2024_must_be_32_chars_exactly!!

# WebSocket
WEBSOCKET_URL=ws://localhost:8081

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3004

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
EOF
echo -e "${GREEN}✅ Created backend/api/.env${NC}"

# Create backend/blockchain-monitor/.env
echo -e "\n${YELLOW}📝 Creating backend/blockchain-monitor/.env...${NC}"
cat > backend/blockchain-monitor/.env << 'EOF'
# Blockchain Monitor Service Environment
# Auto-generated from .env.unified

NODE_ENV=development
PORT=3003
LOG_LEVEL=info
NETWORK=testnet

# Database
DATABASE_URL=postgresql://core_user:core_secure_pass_2024@localhost:5432/core_meme_platform
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Core Blockchain
CORE_RPC_URL=https://rpc.test2.btcs.network
CORE_TESTNET_RPC=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Monitoring Config
START_BLOCK=0
CONFIRMATIONS=3
BATCH_SIZE=100
EOF
echo -e "${GREEN}✅ Created backend/blockchain-monitor/.env${NC}"

# Create backend/websocket/.env
echo -e "\n${YELLOW}📝 Creating backend/websocket/.env...${NC}"
mkdir -p backend/websocket
cat > backend/websocket/.env << 'EOF'
# WebSocket Service Environment
# Auto-generated from .env.unified

NODE_ENV=development
WS_PORT=8081
LOG_LEVEL=info

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Core Blockchain
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Security
JWT_SECRET=core_meme_platform_jwt_secret_2024_strong_key_min_32_chars

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3004

# WebSocket Config
WS_MAX_CONNECTIONS=1000
WS_HEARTBEAT_INTERVAL=30000
EOF
echo -e "${GREEN}✅ Created backend/websocket/.env${NC}"

# Create telegram-bot/.env
echo -e "\n${YELLOW}📝 Creating telegram-bot/.env...${NC}"
cat > telegram-bot/.env << 'EOF'
# Telegram Bot Service Environment
# Auto-generated from .env.unified

NODE_ENV=development
PORT=3004
LOG_LEVEL=info

# Telegram Configuration
TELEGRAM_BOT_TOKEN=8479976221:AAHarPrZ23X33ffo2bc_jlhczWpD-nOj7i4
TELEGRAM_BOT_USERNAME=core_dot_fun_bot
TELEGRAM_WEBHOOK_URL=
TELEGRAM_ADMIN_IDS=8028166336

# Database
DATABASE_URL=postgresql://core_user:core_secure_pass_2024@localhost:5432/core_meme_platform
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Core Blockchain
NETWORK=testnet
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# API Services
API_URL=http://localhost:3001
WEBSOCKET_URL=ws://localhost:8081
FRONTEND_URL=http://localhost:3000

# Security
JWT_SECRET=core_meme_platform_jwt_secret_2024_strong_key_min_32_chars
ENCRYPTION_SECRET=core_meme_encryption_secret_2024_must_be_32_chars_exactly!!
SIGNATURE_SECRET=core_meme_platform_signature_secret_2024_strong_key
EOF
echo -e "${GREEN}✅ Created telegram-bot/.env${NC}"

# Update docker-compose environment
echo -e "\n${YELLOW}📝 Creating .env.docker for Docker Compose...${NC}"
cat > .env.docker << 'EOF'
# Docker Compose Environment
# Auto-generated from .env.unified

# Use 'postgres' and 'redis' as hosts for Docker networking
POSTGRES_HOST=postgres
REDIS_HOST=redis

# All other values same as .env.unified
NODE_ENV=production
LOG_LEVEL=info
NETWORK=testnet

# Database
POSTGRES_PORT=5432
POSTGRES_DB=core_meme_platform
POSTGRES_USER=core_user
POSTGRES_PASSWORD=core_secure_pass_2024

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Core Blockchain
CORE_TESTNET_RPC=https://rpc.test2.btcs.network
CORE_RPC_URL=https://rpc.test2.btcs.network
MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784

# Security
JWT_SECRET=core_meme_platform_jwt_secret_2024_strong_key_min_32_chars
ENCRYPTION_SECRET=core_meme_encryption_secret_2024_must_be_32_chars_exactly!!

# Telegram
TELEGRAM_BOT_TOKEN=8479976221:AAHarPrZ23X33ffo2bc_jlhczWpD-nOj7i4
TELEGRAM_ADMIN_IDS=8028166336
EOF
echo -e "${GREEN}✅ Created .env.docker${NC}"

echo -e "\n${GREEN}✨ Environment files synchronized successfully!${NC}"
echo "================================"
echo -e "${YELLOW}📋 Created files:${NC}"
echo "  • .env (main)"
echo "  • backend/api/.env"
echo "  • backend/blockchain-monitor/.env"
echo "  • backend/websocket/.env"
echo "  • telegram-bot/.env"
echo "  • .env.docker (for Docker Compose)"
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "  1. Review the generated files"
echo "  2. For Docker: docker compose --env-file .env.docker up -d"
echo "  3. For local dev: pnpm install && pnpm dev:all"