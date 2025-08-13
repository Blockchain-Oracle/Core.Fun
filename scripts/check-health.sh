#!/bin/bash

# Health check script for Core Meme Platform

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🏥 Core Meme Platform Health Check${NC}"
echo "===================================="

# Track overall health
ALL_HEALTHY=true

# Function to check service health
check_service() {
    local name=$1
    local url=$2
    local expected=${3:-"ok"}
    
    if curl -s -f -o /dev/null "$url" 2>/dev/null; then
        echo -e "${GREEN}✅ $name: Healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ $name: Not responding${NC}"
        ALL_HEALTHY=false
        return 1
    fi
}

# Function to check port
check_port() {
    local name=$1
    local port=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ $name (Port $port): Open${NC}"
        return 0
    else
        echo -e "${RED}❌ $name (Port $port): Closed${NC}"
        ALL_HEALTHY=false
        return 1
    fi
}

# Function to check Docker container
check_container() {
    local name=$1
    local container=$2
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        local status=$(docker inspect -f '{{.State.Health.Status}}' $container 2>/dev/null || echo "unknown")
        if [ "$status" == "healthy" ] || [ "$status" == "unknown" ]; then
            echo -e "${GREEN}✅ $name: Running${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  $name: Unhealthy (status: $status)${NC}"
            ALL_HEALTHY=false
            return 1
        fi
    else
        echo -e "${RED}❌ $name: Not running${NC}"
        ALL_HEALTHY=false
        return 1
    fi
}

echo -e "\n${YELLOW}Infrastructure Services:${NC}"
echo "------------------------"

# Check PostgreSQL
if docker ps --format '{{.Names}}' | grep -q "core-meme-postgres"; then
    if docker exec core-meme-postgres pg_isready -U core_user -d core_meme_platform > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL: Connected${NC}"
    else
        echo -e "${RED}❌ PostgreSQL: Not ready${NC}"
        ALL_HEALTHY=false
    fi
else
    echo -e "${RED}❌ PostgreSQL: Container not running${NC}"
    ALL_HEALTHY=false
fi

# Check Redis
if docker ps --format '{{.Names}}' | grep -q "core-meme-redis"; then
    if docker exec core-meme-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Redis: Connected${NC}"
    else
        echo -e "${RED}❌ Redis: Not ready${NC}"
        ALL_HEALTHY=false
    fi
else
    echo -e "${RED}❌ Redis: Container not running${NC}"
    ALL_HEALTHY=false
fi

echo -e "\n${YELLOW}Application Services:${NC}"
echo "---------------------"

# Check API Gateway
check_service "API Gateway" "http://localhost:3001/health"

# Check WebSocket Server
check_port "WebSocket Server" 8081

# Check Trading Engine
check_service "Trading Engine" "http://localhost:3003/health"

# Check Telegram Bot webhook endpoint
check_port "Telegram Bot Webhook" 3002

# Check if services are in Docker
echo -e "\n${YELLOW}Docker Services (if using Docker):${NC}"
echo "-----------------------------------"
check_container "Core API Service" "core-api-service" || true
check_container "Blockchain Monitor" "core-blockchain-monitor" || true
check_container "WebSocket Server" "core-websocket" || true
check_container "Trading Engine" "core-trading-engine" || true
check_container "Telegram Bot" "core-telegram-bot" || true

# Test database connection
echo -e "\n${YELLOW}Database Connectivity:${NC}"
echo "----------------------"
if docker exec core-meme-postgres psql -U core_user -d core_meme_platform -c "SELECT 1" > /dev/null 2>&1; then
    TABLE_COUNT=$(docker exec core-meme-postgres psql -U core_user -d core_meme_platform -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')
    echo -e "${GREEN}✅ Database accessible (${TABLE_COUNT} tables)${NC}"
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    ALL_HEALTHY=false
fi

# Test Redis connection
echo -e "\n${YELLOW}Cache Connectivity:${NC}"
echo "-------------------"
if docker exec core-meme-redis redis-cli ping > /dev/null 2>&1; then
    KEY_COUNT=$(docker exec core-meme-redis redis-cli DBSIZE 2>/dev/null | cut -d' ' -f2)
    echo -e "${GREEN}✅ Redis accessible (${KEY_COUNT} keys)${NC}"
else
    echo -e "${RED}❌ Cannot connect to Redis${NC}"
    ALL_HEALTHY=false
fi

# Check Core RPC connection
echo -e "\n${YELLOW}Blockchain Connectivity:${NC}"
echo "------------------------"
if [ -f .env ]; then
    source .env
    if [ ! -z "$CORE_RPC_URL" ]; then
        if curl -s -X POST "$CORE_RPC_URL" \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            | grep -q "result"; then
            echo -e "${GREEN}✅ Core RPC: Connected${NC}"
        else
            echo -e "${YELLOW}⚠️  Core RPC: Cannot connect to $CORE_RPC_URL${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Core RPC URL not configured${NC}"
    fi
fi

# System resource check
echo -e "\n${YELLOW}System Resources:${NC}"
echo "-----------------"
# Memory
MEM_USAGE=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
echo -e "Memory Usage: ${MEM_USAGE}%"

# Disk
DISK_USAGE=$(df -h / | awk 'NR==2{printf "%s", $5}')
echo -e "Disk Usage: ${DISK_USAGE}"

# Docker disk usage
if command -v docker &> /dev/null; then
    DOCKER_DISK=$(docker system df --format "table {{.Type}}\t{{.Size}}" | grep -E "Images|Containers|Volumes" | awk '{sum+=$2} END {print sum}')
    echo -e "Docker Usage: ~${DOCKER_DISK:-0} MB"
fi

# Summary
echo -e "\n===================================="
if [ "$ALL_HEALTHY" = true ]; then
    echo -e "${GREEN}✅ System Status: All services operational${NC}"
else
    echo -e "${RED}❌ System Status: Some services need attention${NC}"
    echo -e "${YELLOW}Run './scripts/start-services.sh' to start missing services${NC}"
    exit 1
fi

# Optional: Test endpoints
if [ "$1" == "--test" ]; then
    echo -e "\n${YELLOW}Running endpoint tests...${NC}"
    echo "------------------------"
    
    # Test API endpoints
    echo -n "Testing token list endpoint... "
    if curl -s "http://localhost:3001/api/tokens" | grep -q "tokens"; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
    
    # Test WebSocket connection
    echo -n "Testing WebSocket connection... "
    if timeout 2 bash -c 'exec 3<>/dev/tcp/localhost/8081' 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
fi

echo ""
echo "Run with --test flag for endpoint testing"