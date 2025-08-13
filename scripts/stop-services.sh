#!/bin/bash

# Stop all Core Meme Platform services

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping Core Meme Platform Services${NC}"
echo "========================================"

# Function to kill process on port
kill_port() {
    local port=$1
    local name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}Stopping $name on port $port...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ $name stopped${NC}"
    else
        echo -e "${GREEN}✅ $name not running${NC}"
    fi
}

# Stop services based on mode
if [ "$1" == "docker" ]; then
    echo -e "${YELLOW}Stopping Docker services...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ All Docker services stopped${NC}"
    
elif [ "$1" == "pm2" ]; then
    echo -e "${YELLOW}Stopping PM2 services...${NC}"
    pm2 stop all
    pm2 delete all
    echo -e "${GREEN}✅ All PM2 services stopped${NC}"
    
else
    echo -e "${YELLOW}Stopping development services...${NC}"
    
    # Stop each service by port
    kill_port 3001 "API Gateway"
    kill_port 8081 "WebSocket Server"
    kill_port 3003 "Trading Engine"
    kill_port 3002 "Telegram Bot"
    
    # Kill any remaining node processes for our services
    echo -e "${YELLOW}Cleaning up remaining processes...${NC}"
    pkill -f "pnpm dev" 2>/dev/null || true
    pkill -f "ts-node" 2>/dev/null || true
    pkill -f "nodemon" 2>/dev/null || true
    
    echo -e "${GREEN}✅ All development services stopped${NC}"
fi

# Option to stop infrastructure
if [ "$2" == "--all" ]; then
    echo -e "\n${YELLOW}Stopping infrastructure services...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ PostgreSQL and Redis stopped${NC}"
else
    echo -e "\n${YELLOW}Infrastructure services (PostgreSQL, Redis) still running${NC}"
    echo "Use '$0 $1 --all' to stop everything"
fi

echo -e "\n${GREEN}✅ Services stopped successfully${NC}"