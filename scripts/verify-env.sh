#!/bin/bash

# Verify Environment Consistency Script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 Verifying Environment Configuration Consistency${NC}"
echo "=================================================="

ERRORS=0
WARNINGS=0

# Critical variables that must match across all files
CRITICAL_VARS=(
    "MEME_FACTORY_ADDRESS=0x0eeF9597a9B231b398c29717e2ee89eF6962b784"
    "API_PORT=3001"
    "WS_PORT=8081"
    "POSTGRES_DB=core_meme_platform"
    "POSTGRES_USER=core_user"
    "NETWORK=testnet"
    "CORE_RPC_URL=https://1114.rpc.thirdweb.com"
)

# Check if files exist
echo -e "\n${YELLOW}📁 Checking environment files...${NC}"
ENV_FILES=(
    ".env"
    "backend/api/.env"
    "backend/blockchain-monitor/.env"
    "backend/websocket/.env"
    "telegram-bot/.env"
)

for file in "${ENV_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✅${NC} $file exists"
    else
        echo -e "  ${RED}❌${NC} $file missing"
        ((ERRORS++))
    fi
done

# Check critical variables consistency
echo -e "\n${YELLOW}🔧 Checking critical variables...${NC}"
for var in "${CRITICAL_VARS[@]}"; do
    VAR_NAME="${var%%=*}"
    VAR_VALUE="${var#*=}"
    echo -e "\nChecking ${VAR_NAME}:"
    
    ALL_MATCH=true
    for file in "${ENV_FILES[@]}"; do
        if [ -f "$file" ]; then
            if grep -q "^${VAR_NAME}=" "$file"; then
                FILE_VALUE=$(grep "^${VAR_NAME}=" "$file" | cut -d'=' -f2)
                if [ "$FILE_VALUE" = "$VAR_VALUE" ]; then
                    echo -e "  ${GREEN}✅${NC} $file: $FILE_VALUE"
                else
                    echo -e "  ${RED}❌${NC} $file: $FILE_VALUE (expected: $VAR_VALUE)"
                    ALL_MATCH=false
                    ((ERRORS++))
                fi
            else
                # Some variables may not be in all files, that's okay
                echo -e "  ${YELLOW}⚠️${NC} $file: not defined"
            fi
        fi
    done
    
    if $ALL_MATCH; then
        echo -e "  ${GREEN}All files consistent${NC}"
    fi
done

# Check JWT_SECRET consistency
echo -e "\n${YELLOW}🔐 Checking security keys...${NC}"
JWT_SECRET=$(grep "^JWT_SECRET=" .env | cut -d'=' -f2)
if [ -n "$JWT_SECRET" ]; then
    echo "JWT_SECRET length: ${#JWT_SECRET} characters"
    if [ ${#JWT_SECRET} -lt 32 ]; then
        echo -e "  ${YELLOW}⚠️${NC} JWT_SECRET should be at least 32 characters"
        ((WARNINGS++))
    else
        echo -e "  ${GREEN}✅${NC} JWT_SECRET is secure"
    fi
else
    echo -e "  ${RED}❌${NC} JWT_SECRET not found"
    ((ERRORS++))
fi

# Check ENCRYPTION_SECRET
ENCRYPTION_SECRET=$(grep "^ENCRYPTION_SECRET=" .env | cut -d'=' -f2)
if [ -n "$ENCRYPTION_SECRET" ]; then
    echo "ENCRYPTION_SECRET length: ${#ENCRYPTION_SECRET} characters"
    # AES-256 requires exactly 32 bytes
    if [ ${#ENCRYPTION_SECRET} -ne 32 ] && [ ${#ENCRYPTION_SECRET} -ne 64 ]; then
        echo -e "  ${YELLOW}⚠️${NC} ENCRYPTION_SECRET should be 32 or 64 characters for AES"
        ((WARNINGS++))
    else
        echo -e "  ${GREEN}✅${NC} ENCRYPTION_SECRET is properly sized"
    fi
else
    echo -e "  ${RED}❌${NC} ENCRYPTION_SECRET not found"
    ((ERRORS++))
fi

# Check port conflicts
echo -e "\n${YELLOW}🔌 Checking for port conflicts...${NC}"
PORTS=(3001 3003 3004 5432 6379 8081)
for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠️${NC} Port $port is already in use"
        ((WARNINGS++))
    else
        echo -e "  ${GREEN}✅${NC} Port $port is available"
    fi
done

# Check Docker/localhost consistency
echo -e "\n${YELLOW}🐳 Checking Docker vs Local configuration...${NC}"
if grep -q "POSTGRES_HOST=postgres" .env; then
    echo -e "  ${YELLOW}⚠️${NC} Main .env is configured for Docker (POSTGRES_HOST=postgres)"
    echo "     For local development, change to POSTGRES_HOST=localhost"
    ((WARNINGS++))
elif grep -q "POSTGRES_HOST=localhost" .env; then
    echo -e "  ${GREEN}✅${NC} Main .env is configured for local development"
fi

if [ -f ".env.docker" ]; then
    if grep -q "POSTGRES_HOST=postgres" .env.docker; then
        echo -e "  ${GREEN}✅${NC} .env.docker is properly configured for Docker"
    else
        echo -e "  ${YELLOW}⚠️${NC} .env.docker should use POSTGRES_HOST=postgres"
        ((WARNINGS++))
    fi
else
    echo -e "  ${YELLOW}ℹ️${NC} .env.docker not found (okay if not using Docker)"
fi

# Check frontend environment
echo -e "\n${YELLOW}🌐 Checking frontend configuration...${NC}"
FRONTEND_ENV="../core.fun_Frontend/.env.local"
if [ -f "$FRONTEND_ENV" ]; then
    echo -e "  ${GREEN}✅${NC} Frontend .env.local exists"
    
    # Check if contract addresses match
    FRONTEND_FACTORY=$(grep "NEXT_PUBLIC_MEME_FACTORY_ADDRESS=" "$FRONTEND_ENV" | cut -d'=' -f2)
    BACKEND_FACTORY=$(grep "MEME_FACTORY_ADDRESS=" .env | cut -d'=' -f2)
    
    if [ "$FRONTEND_FACTORY" = "$BACKEND_FACTORY" ]; then
        echo -e "  ${GREEN}✅${NC} Contract addresses match"
    else
        echo -e "  ${RED}❌${NC} Contract addresses don't match!"
        echo "     Frontend: $FRONTEND_FACTORY"
        echo "     Backend:  $BACKEND_FACTORY"
        ((ERRORS++))
    fi
else
    echo -e "  ${YELLOW}⚠️${NC} Frontend .env.local not found"
    ((WARNINGS++))
fi

# Summary
echo -e "\n=================================================="
echo -e "${GREEN}📊 Verification Summary${NC}"
echo -e "=================================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All environment files are consistent!${NC}"
    echo -e "\nYou're ready to start:"
    echo "  • For Docker: docker compose --env-file .env.docker up -d"
    echo "  • For local:  docker compose up -d postgres redis && pnpm dev:all"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Configuration is functional with $WARNINGS warning(s)${NC}"
    echo -e "\nConsider reviewing the warnings above."
    echo "You can still proceed with starting the services."
else
    echo -e "${RED}❌ Found $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo -e "\nPlease fix the errors before starting services."
    echo "Run ./scripts/sync-env.sh to regenerate consistent files."
    exit 1
fi