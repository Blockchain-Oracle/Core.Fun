#!/bin/bash

# Reset database for Core Meme Platform

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}⚠️  Database Reset Script${NC}"
echo "========================"
echo -e "${YELLOW}This will DELETE all data in the database!${NC}"
echo -n "Are you sure? (yes/no): "
read CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

# Load environment variables
if [ -f .env ]; then
    source .env
fi

DB_NAME=${POSTGRES_DB:-core_meme_platform}
DB_USER=${POSTGRES_USER:-core_user}
DB_PASSWORD=${POSTGRES_PASSWORD:-core_secure_pass_2024}

echo -e "\n${YELLOW}Resetting database: $DB_NAME${NC}"

# Check if PostgreSQL is running
if ! docker ps --format '{{.Names}}' | grep -q "core-meme-postgres"; then
    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    docker-compose up -d postgres
    sleep 5
fi

# Drop and recreate database
echo -e "${YELLOW}Dropping existing database...${NC}"
docker exec core-meme-postgres psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

echo -e "${YELLOW}Creating new database...${NC}"
docker exec core-meme-postgres psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Initialize schema
if [ -f backend/api/src/database/schema.sql ]; then
    echo -e "${YELLOW}Applying database schema...${NC}"
    docker exec -i core-meme-postgres psql -U $DB_USER -d $DB_NAME < backend/api/src/database/schema.sql
    echo -e "${GREEN}✅ Schema applied${NC}"
else
    echo -e "${YELLOW}Creating basic schema...${NC}"
    docker exec core-meme-postgres psql -U $DB_USER -d $DB_NAME -c "
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE,
        username VARCHAR(255),
        wallet_address VARCHAR(42),
        encrypted_private_key TEXT,
        subscription_tier VARCHAR(50) DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tokens table
    CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        address VARCHAR(42) UNIQUE NOT NULL,
        symbol VARCHAR(50),
        name VARCHAR(255),
        decimals INTEGER DEFAULT 18,
        creator_address VARCHAR(42),
        bonding_curve_address VARCHAR(42),
        total_supply NUMERIC,
        current_supply NUMERIC,
        market_cap NUMERIC,
        liquidity NUMERIC,
        volume_24h NUMERIC,
        price_usd NUMERIC,
        holders_count INTEGER DEFAULT 0,
        is_honeypot BOOLEAN DEFAULT FALSE,
        rug_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Trades table
    CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        wallet_address VARCHAR(42),
        token_address VARCHAR(42),
        type VARCHAR(10),
        amount_core NUMERIC,
        amount_token NUMERIC,
        price NUMERIC,
        tx_hash VARCHAR(66),
        status VARCHAR(20),
        pnl NUMERIC,
        pnl_percentage NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Positions table
    CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token_address VARCHAR(42),
        amount NUMERIC,
        avg_buy_price NUMERIC,
        current_value NUMERIC,
        pnl NUMERIC,
        pnl_percentage NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, token_address)
    );

    -- Alerts table
    CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token_address VARCHAR(42),
        type VARCHAR(50),
        condition VARCHAR(20),
        target_value NUMERIC,
        is_active BOOLEAN DEFAULT TRUE,
        triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Price history table
    CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        token_address VARCHAR(42),
        price NUMERIC,
        volume NUMERIC,
        liquidity NUMERIC,
        market_cap NUMERIC,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) UNIQUE,
        block_number BIGINT,
        from_address VARCHAR(42),
        to_address VARCHAR(42),
        token_address VARCHAR(42),
        method VARCHAR(50),
        value NUMERIC,
        gas_used NUMERIC,
        status VARCHAR(20),
        timestamp TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX idx_tokens_address ON tokens(address);
    CREATE INDEX idx_trades_user_id ON trades(user_id);
    CREATE INDEX idx_trades_token ON trades(token_address);
    CREATE INDEX idx_positions_user_token ON positions(user_id, token_address);
    CREATE INDEX idx_alerts_user ON alerts(user_id);
    CREATE INDEX idx_price_history_token ON price_history(token_address, timestamp DESC);
    CREATE INDEX idx_transactions_block ON transactions(block_number DESC);
    "
    echo -e "${GREEN}✅ Basic schema created${NC}"
fi

# Clear Redis cache
echo -e "\n${YELLOW}Clearing Redis cache...${NC}"
if docker ps --format '{{.Names}}' | grep -q "core-meme-redis"; then
    docker exec core-meme-redis redis-cli FLUSHALL > /dev/null
    echo -e "${GREEN}✅ Redis cache cleared${NC}"
fi

# Seed data (optional)
if [ "$1" == "--seed" ]; then
    echo -e "\n${YELLOW}Adding seed data...${NC}"
    docker exec core-meme-postgres psql -U $DB_USER -d $DB_NAME -c "
    -- Insert test user
    INSERT INTO users (telegram_id, username, wallet_address) 
    VALUES (123456789, 'testuser', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
    
    -- Insert test tokens
    INSERT INTO tokens (address, symbol, name, price_usd, market_cap, liquidity, volume_24h)
    VALUES 
    ('0x1234567890123456789012345678901234567890', 'TEST', 'Test Token', 0.001, 1000000, 500000, 100000),
    ('0x2345678901234567890123456789012345678901', 'MEME', 'Meme Token', 0.0001, 500000, 250000, 50000);
    "
    echo -e "${GREEN}✅ Seed data added${NC}"
fi

echo -e "\n${GREEN}✅ Database reset complete!${NC}"
echo "Database: $DB_NAME"
echo "User: $DB_USER"

# Show table count
TABLE_COUNT=$(docker exec core-meme-postgres psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | tr -d ' ')
echo "Tables created: $TABLE_COUNT"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Run migrations if available: pnpm db:migrate"
echo "2. Start services: ./scripts/start-services.sh"
echo "3. Add seed data: $0 --seed"