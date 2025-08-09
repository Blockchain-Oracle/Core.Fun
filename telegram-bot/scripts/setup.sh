#!/bin/bash

# Core Meme Platform - Telegram Bot Setup Script
# This script helps set up the development environment

echo "🚀 Core Meme Platform - Telegram Bot Setup"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_requirement() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed${NC}"
        echo "   Please install $1 and try again"
        exit 1
    else
        echo -e "${GREEN}✓ $1 is installed${NC}"
    fi
}

echo "Checking requirements..."
check_requirement "node"
check_requirement "pnpm"
check_requirement "psql"
check_requirement "redis-cli"

echo ""
echo "Setting up environment..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env and add your credentials${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "Setting up PostgreSQL database..."

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start postgresql
    else
        sudo systemctl start postgresql
    fi
fi

# Database setup
read -p "Enter PostgreSQL username (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -p "Enter database name (default: corememe): " DB_NAME
DB_NAME=${DB_NAME:-corememe}

echo "Creating database..."
createdb -U $DB_USER $DB_NAME 2>/dev/null || echo "Database might already exist"

echo "Running database migrations..."
psql -U $DB_USER -d $DB_NAME -f scripts/setup-db.sql

echo ""
echo "Setting up Redis..."

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo -e "${YELLOW}Starting Redis...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start redis
    else
        sudo systemctl start redis
    fi
fi

echo -e "${GREEN}✓ Redis is running${NC}"

echo ""
echo "Updating .env with database configuration..."

# Update .env with database URL
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER@localhost:5432/$DB_NAME|" .env
else
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER@localhost:5432/$DB_NAME|" .env
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your Telegram bot token:"
echo "   - TELEGRAM_BOT_TOKEN"
echo "   - TELEGRAM_BOT_USERNAME"
echo "   - JWT_SECRET (generate a secure random string)"
echo "   - ENCRYPTION_SECRET (generate a secure random string)"
echo ""
echo "2. Configure Core blockchain RPC:"
echo "   - CORE_RPC_URL (default: https://rpc.coredao.org)"
echo ""
echo "3. Start the bot:"
echo "   pnpm run dev"
echo ""
echo "For production deployment:"
echo "   pnpm run build"
echo "   pnpm start"
echo ""
echo "Happy trading! 🚀"