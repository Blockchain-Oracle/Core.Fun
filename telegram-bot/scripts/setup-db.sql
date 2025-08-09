-- Core Meme Platform - Database Setup Script
-- Run this script to initialize the PostgreSQL database

-- Create database (run as superuser)
-- CREATE DATABASE corememe;

-- Connect to the database
-- \c corememe;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS copied_trades CASCADE;
DROP TABLE IF EXISTS copy_trades CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    portfolio_value DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Wallets table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(42) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('primary', 'trading', 'withdraw')),
    encrypted_private_key TEXT,
    network VARCHAR(20) DEFAULT 'CORE',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, address)
);

-- Positions table
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    token_name VARCHAR(255),
    amount DECIMAL(30, 18) NOT NULL,
    avg_buy_price DECIMAL(30, 18) NOT NULL,
    current_price DECIMAL(30, 18),
    initial_investment DECIMAL(20, 8) NOT NULL,
    current_value DECIMAL(20, 8),
    pnl DECIMAL(20, 8),
    pnl_percentage DECIMAL(10, 2),
    first_buy_time TIMESTAMP DEFAULT NOW(),
    last_update_time TIMESTAMP DEFAULT NOW(),
    trades INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, token_address)
);

-- Trading history with P&L tracking
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20),
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    amount_core DECIMAL(20, 8) NOT NULL,
    amount_token DECIMAL(30, 18) NOT NULL,
    price DECIMAL(30, 18) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    pnl DECIMAL(20, 8),
    pnl_percentage DECIMAL(10, 2),
    buy_price DECIMAL(30, 18),
    sell_price DECIMAL(30, 18),
    buy_time TIMESTAMP,
    sell_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Copy trade settings
CREATE TABLE copy_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_wallet VARCHAR(42) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    copy_buys BOOLEAN DEFAULT true,
    copy_sells BOOLEAN DEFAULT true,
    max_amount_per_trade DECIMAL(20, 8) DEFAULT 1,
    percentage_of_wallet DECIMAL(5, 2) DEFAULT 25,
    min_token_age INTEGER DEFAULT 1,
    max_slippage DECIMAL(5, 2) DEFAULT 15,
    blacklisted_tokens TEXT[],
    whitelisted_tokens TEXT[],
    stop_loss DECIMAL(5, 2),
    take_profit DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, target_wallet)
);

-- Copied trades history
CREATE TABLE copied_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_wallet VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    original_amount DECIMAL(20, 8) NOT NULL,
    copied_amount DECIMAL(20, 8) NOT NULL,
    original_tx_hash VARCHAR(66) NOT NULL,
    copied_tx_hash VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    settings JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'premium', 'pro')),
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    payment_method VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active'
);

-- Create indexes for better performance
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_token ON positions(token_address);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_created_at ON trades(created_at);
CREATE INDEX idx_copy_trades_target ON copy_trades(target_wallet);
CREATE INDEX idx_copied_trades_user ON copied_trades(user_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust username as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- Insert sample data for testing (optional)
-- INSERT INTO users (telegram_id, username, wallet_address, encrypted_private_key)
-- VALUES (123456789, 'testuser', '0x1234567890123456789012345678901234567890', 'encrypted_key_here');

COMMENT ON TABLE users IS 'User accounts with encrypted wallet data';
COMMENT ON TABLE positions IS 'Active and historical token positions';
COMMENT ON TABLE trades IS 'Complete trade history with P&L tracking';
COMMENT ON TABLE copy_trades IS 'Copy trading configuration per wallet';
COMMENT ON TABLE copied_trades IS 'History of executed copy trades';

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Database setup completed successfully!'; 
END $$;