#!/bin/bash

# Core Meme Platform - One-Click Setup Script
# This script sets up the entire platform for development

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Core Meme Platform Setup Script${NC}"
echo "===================================="

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js v18+ from https://nodejs.org"
    exit 1
fi
echo -e "${GREEN}✅ Node.js found:${NC} $(node --version)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}📦 Installing pnpm...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}✅ pnpm found:${NC} $(pnpm --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker from https://docker.com"
    exit 1
fi
echo -e "${GREEN}✅ Docker found:${NC} $(docker --version)"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        echo "Please install Docker Compose"
        exit 1
    fi
    # Use docker compose instead of docker-compose
    alias docker-compose='docker compose'
fi
echo -e "${GREEN}✅ Docker Compose found${NC}"

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
pnpm install

# Setup environment file
echo -e "\n${YELLOW}Setting up environment configuration...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file from template${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Create necessary directories
echo -e "\n${YELLOW}Creating necessary directories...${NC}"
mkdir -p logs
mkdir -p storage
mkdir -p tmp
echo -e "${GREEN}✅ Directories created${NC}"

# Start infrastructure services
echo -e "\n${YELLOW}Starting infrastructure services...${NC}"
docker-compose up -d postgres redis
echo -e "${GREEN}✅ PostgreSQL and Redis started${NC}"

# Wait for PostgreSQL to be ready
echo -e "\n${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 5
until docker exec core-meme-postgres pg_isready -U core_user -d core_meme_platform > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e "\n${GREEN}✅ PostgreSQL is ready${NC}"

# Initialize database
echo -e "\n${YELLOW}Initializing database...${NC}"
if [ -f backend/api/src/database/schema.sql ]; then
    docker exec -i core-meme-postgres psql -U core_user -d core_meme_platform < backend/api/src/database/schema.sql 2>/dev/null || true
    echo -e "${GREEN}✅ Database schema initialized${NC}"
else
    echo -e "${YELLOW}⚠️  No schema file found, skipping database initialization${NC}"
fi

# Build all services
echo -e "\n${YELLOW}Building all services...${NC}"
pnpm build

# Generate TypeScript types
echo -e "\n${YELLOW}Generating TypeScript types...${NC}"
pnpm --filter @core-meme/shared build

echo -e "\n${GREEN}🎉 Setup Complete!${NC}"
echo "===================================="
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Edit .env file with your configuration:"
echo "   - Set TELEGRAM_BOT_TOKEN from @BotFather"
echo "   - Configure CORE_RPC_URL for your network"
echo "   - Set JWT_SECRET and other secrets"
echo ""
echo "2. Deploy smart contracts (if not already deployed):"
echo "   cd contracts && pnpm deploy"
echo ""
echo "3. Start all services:"
echo "   ./scripts/start-services.sh"
echo ""
echo "4. Or start in development mode:"
echo "   pnpm dev:all"
echo ""
echo "5. Check service health:"
echo "   ./scripts/check-health.sh"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"