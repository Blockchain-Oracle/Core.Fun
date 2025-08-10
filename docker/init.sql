-- Core Meme Platform Database Initialization
-- This script creates the initial database schema

-- Create database if not exists
-- Note: Database creation is handled by docker-compose environment variables

-- Set timezone
SET TIME ZONE 'UTC';

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE alert_type AS ENUM ('above', 'below', 'change');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('buy', 'sell', 'launch', 'add_liquidity', 'remove_liquidity');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    language_code VARCHAR(10) DEFAULT 'en',
    is_premium BOOLEAN DEFAULT FALSE,
    subscription_tier subscription_tier DEFAULT 'free',
    wallet_address VARCHAR(42),
    encrypted_private_key TEXT,
    referral_code VARCHAR(20) UNIQUE,
    referred_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    INDEX idx_users_telegram_id (telegram_id),
    INDEX idx_users_wallet (wallet_address),
    INDEX idx_users_referral (referral_code)
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier subscription_tier NOT NULL,
    payment_method VARCHAR(50),
    payment_id VARCHAR(255),
    amount DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_subscriptions_user (user_id),
    INDEX idx_subscriptions_status (status),
    INDEX idx_subscriptions_expires (expires_at)
);

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    decimals INTEGER DEFAULT 18,
    total_supply VARCHAR(78),
    creator_address VARCHAR(42),
    factory_address VARCHAR(42),
    description TEXT,
    image_url TEXT,
    website TEXT,
    twitter TEXT,
    telegram TEXT,
    is_launched BOOLEAN DEFAULT FALSE,
    launched_at TIMESTAMP WITH TIME ZONE,
    liquidity_added DECIMAL(20, 8),
    market_cap DECIMAL(20, 2),
    volume_24h DECIMAL(20, 2),
    price_usd DECIMAL(20, 8),
    price_core DECIMAL(20, 8),
    holders_count INTEGER DEFAULT 0,
    transactions_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tokens_address (address),
    INDEX idx_tokens_symbol (symbol),
    INDEX idx_tokens_creator (creator_address),
    INDEX idx_tokens_launched (is_launched),
    INDEX idx_tokens_created (created_at)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    type transaction_type NOT NULL,
    amount VARCHAR(78),
    amount_core VARCHAR(78),
    amount_usd DECIMAL(20, 2),
    gas_used VARCHAR(78),
    gas_price VARCHAR(78),
    status INTEGER DEFAULT 1,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transactions_hash (hash),
    INDEX idx_transactions_token (token_id),
    INDEX idx_transactions_from (from_address),
    INDEX idx_transactions_to (to_address),
    INDEX idx_transactions_type (type),
    INDEX idx_transactions_timestamp (timestamp)
);

-- User positions table
CREATE TABLE IF NOT EXISTS user_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20),
    amount VARCHAR(78),
    average_buy_price DECIMAL(20, 8),
    total_invested DECIMAL(20, 8),
    realized_pnl DECIMAL(20, 8),
    unrealized_pnl DECIMAL(20, 8),
    is_active BOOLEAN DEFAULT TRUE,
    first_buy_at TIMESTAMP WITH TIME ZONE,
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token_id),
    INDEX idx_positions_user (user_id),
    INDEX idx_positions_token (token_id),
    INDEX idx_positions_active (is_active)
);

-- Price alerts table
CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20),
    alert_type alert_type NOT NULL,
    target_price DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8),
    is_active BOOLEAN DEFAULT TRUE,
    notification_sent BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alerts_user (user_id),
    INDEX idx_alerts_token (token_address),
    INDEX idx_alerts_active (is_active),
    INDEX idx_alerts_sent (notification_sent)
);

-- Copy trades table
CREATE TABLE IF NOT EXISTS copy_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_address VARCHAR(42) NOT NULL,
    target_name VARCHAR(255),
    allocation_percentage DECIMAL(5, 2) DEFAULT 100.00,
    max_amount_per_trade DECIMAL(20, 8),
    min_amount_per_trade DECIMAL(20, 8),
    is_active BOOLEAN DEFAULT TRUE,
    total_copied INTEGER DEFAULT 0,
    total_profit DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_copy_user (user_id),
    INDEX idx_copy_target (target_address),
    INDEX idx_copy_active (is_active)
);

-- Alert settings table
CREATE TABLE IF NOT EXISTS alert_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_tokens BOOLEAN DEFAULT TRUE,
    large_trades BOOLEAN DEFAULT FALSE,
    whale_activity BOOLEAN DEFAULT FALSE,
    price_changes BOOLEAN DEFAULT TRUE,
    liquidity_changes BOOLEAN DEFAULT FALSE,
    rug_warnings BOOLEAN DEFAULT TRUE,
    min_liquidity DECIMAL(20, 8) DEFAULT 1000,
    min_market_cap DECIMAL(20, 8) DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alert_settings_user (user_id)
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token_id),
    INDEX idx_watchlist_user (user_id),
    INDEX idx_watchlist_token (token_id)
);

-- Trading stats table
CREATE TABLE IF NOT EXISTS trading_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(20, 8) DEFAULT 0,
    total_profit DECIMAL(20, 8) DEFAULT 0,
    best_trade DECIMAL(20, 8) DEFAULT 0,
    worst_trade DECIMAL(20, 8) DEFAULT 0,
    average_holding_time INTERVAL,
    favorite_token VARCHAR(42),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trading_stats_user (user_id)
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_user (user_id),
    INDEX idx_activity_action (action),
    INDEX idx_activity_created (created_at)
);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at BEFORE UPDATE ON tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_positions_updated_at BEFORE UPDATE ON user_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_alerts_updated_at BEFORE UPDATE ON price_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_copy_trades_updated_at BEFORE UPDATE ON copy_trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_settings_updated_at BEFORE UPDATE ON alert_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trading_stats_updated_at BEFORE UPDATE ON trading_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO core_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO core_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO core_user;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_active ON users(last_active) WHERE is_banned = FALSE;
CREATE INDEX IF NOT EXISTS idx_tokens_trending ON tokens(volume_24h DESC, holders_count DESC) WHERE is_launched = TRUE;
CREATE INDEX IF NOT EXISTS idx_transactions_recent ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_pending ON price_alerts(token_address, is_active) WHERE notification_sent = FALSE;

-- Initial data
INSERT INTO users (telegram_id, username, first_name, subscription_tier)
VALUES (0, 'system', 'System', 'pro')
ON CONFLICT (telegram_id) DO NOTHING;

-- Database optimization settings
ALTER DATABASE core_meme_platform SET random_page_cost = 1.1;
ALTER DATABASE core_meme_platform SET effective_cache_size = '256MB';
ALTER DATABASE core_meme_platform SET shared_buffers = '128MB';

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user information from Telegram and their platform settings';
COMMENT ON TABLE tokens IS 'Meme tokens created or tracked on the platform';
COMMENT ON TABLE transactions IS 'All token transactions monitored by the platform';
COMMENT ON TABLE price_alerts IS 'User-configured price alerts for tokens';
COMMENT ON TABLE subscriptions IS 'User subscription records for premium features';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
END $$;