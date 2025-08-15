#!/bin/bash

# Start all Core Meme Platform services

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Core Meme Platform Services${NC}"
echo "========================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please run ./scripts/setup.sh first"
    exit 1
fi

# Function to check if service is running
check_service() {
    local service=$1
    local port=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ $service is already running on port $port${NC}"
        return 0
    else
        return 1
    fi
}

# Start infrastructure if not running
echo -e "\n${YELLOW}Starting infrastructure services...${NC}"
docker-compose up -d postgres redis

# Wait for PostgreSQL
echo -e "${YELLOW}Waiting for PostgreSQL...${NC}"
until docker exec core-meme-postgres pg_isready -U core_user -d core_meme_platform > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✅ PostgreSQL ready${NC}"

# Wait for Redis
echo -e "${YELLOW}Waiting for Redis...${NC}"
until docker exec core-meme-redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✅ Redis ready${NC}"

# Start services based on mode
if [ "$1" == "docker" ]; then
    echo -e "\n${YELLOW}Starting all services with Docker...${NC}"
    docker-compose up -d
    
    echo -e "\n${GREEN}✅ All services started with Docker${NC}"
    echo -e "${YELLOW}View logs with: docker-compose logs -f${NC}"
    
elif [ "$1" == "pm2" ]; then
    echo -e "\n${YELLOW}Starting all services with PM2...${NC}"
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}❌ PM2 is not installed${NC}"
        echo "Install with: npm install -g pm2"
        exit 1
    fi
    
    # Start with PM2
    pm2 start ecosystem.config.js
    pm2 save
    
    echo -e "\n${GREEN}✅ All services started with PM2${NC}"
    echo -e "${YELLOW}View status with: pm2 status${NC}"
    echo -e "${YELLOW}View logs with: pm2 logs${NC}"
    
else
    echo -e "\n${YELLOW}Starting all services in development mode...${NC}"
    
    # Start each service in background
    echo -e "${YELLOW}Starting API Gateway...${NC}"
    if ! check_service "API Gateway" 3001; then
        cd backend/api && pnpm dev > ../../logs/api.log 2>&1 &
        echo -e "${GREEN}✅ API Gateway starting on port 3001${NC}"
    fi
    
    
    echo -e "${YELLOW}Starting WebSocket Server...${NC}"
    if ! check_service "WebSocket" 8081; then
        cd websocket && pnpm dev > ../logs/websocket.log 2>&1 &
        echo -e "${GREEN}✅ WebSocket Server starting on port 8081${NC}"
    fi
    
    
    echo -e "${YELLOW}Starting Blockchain Monitor...${NC}"
    cd backend/blockchain-monitor && pnpm dev > ../../logs/blockchain-monitor.log 2>&1 &
    echo -e "${GREEN}✅ Blockchain Monitor starting${NC}"
    
    echo -e "${YELLOW}Starting Telegram Bot...${NC}"
    if ! check_service "Telegram Bot" 3002; then
        cd telegram-bot && pnpm dev > ../logs/telegram-bot.log 2>&1 &
        echo -e "${GREEN}✅ Telegram Bot starting${NC}"
    fi
    
    echo -e "\n${GREEN}✅ All services started in development mode${NC}"
    echo -e "${YELLOW}View logs in ./logs/ directory${NC}"
    echo -e "${YELLOW}Stop all with: ./scripts/stop-services.sh${NC}"
fi

# Wait a moment for services to start
sleep 3

# Run health check
echo -e "\n${YELLOW}Running health check...${NC}"
./scripts/check-health.sh || true

echo -e "\n${GREEN}🎉 Core Meme Platform is running!${NC}"
echo "========================================"
echo -e "${YELLOW}Service URLs:${NC}"
echo "• API Gateway: http://localhost:3001"
echo "• WebSocket: ws://localhost:8081"
echo "• Blockchain Monitor: http://localhost:3003"
echo "• PostgreSQL: localhost:5432"
echo "• Redis: localhost:6379"
echo ""
echo -e "${YELLOW}Management:${NC}"
echo "• Health check: ./scripts/check-health.sh"
echo "• View logs: tail -f logs/*.log"
echo "• Stop services: ./scripts/stop-services.sh"