-- Migration: Add holder tracking tables
-- Created: 2024-01-17
-- Description: Tables for tracking ERC20 token holders via Transfer events

-- Table: token_holders
-- Tracks current balance of each holder for each token
CREATE TABLE IF NOT EXISTS token_holders (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(42) NOT NULL,
    address VARCHAR(42) NOT NULL,
    balance NUMERIC(78, 0) NOT NULL DEFAULT 0, -- Support up to 78 digits for large supplies
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique holder per token
    UNIQUE(token_address, address)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_token_holders_token ON token_holders(token_address);
CREATE INDEX IF NOT EXISTS idx_token_holders_address ON token_holders(address);
CREATE INDEX IF NOT EXISTS idx_token_holders_balance ON token_holders(balance DESC);
CREATE INDEX IF NOT EXISTS idx_token_holders_token_balance ON token_holders(token_address, balance DESC);

-- Table: transfer_events
-- Stores all Transfer events for audit and historical analysis
CREATE TABLE IF NOT EXISTS transfer_events (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(42) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    value NUMERIC(78, 0) NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate events
    UNIQUE(transaction_hash, log_index)
);

-- Indexes for transfer events
CREATE INDEX IF NOT EXISTS idx_transfer_events_token ON transfer_events(token_address);
CREATE INDEX IF NOT EXISTS idx_transfer_events_from ON transfer_events(from_address);
CREATE INDEX IF NOT EXISTS idx_transfer_events_to ON transfer_events(to_address);
CREATE INDEX IF NOT EXISTS idx_transfer_events_block ON transfer_events(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_events_timestamp ON transfer_events(timestamp DESC);

-- Table: holder_statistics
-- Aggregated statistics for each token
CREATE TABLE IF NOT EXISTS holder_statistics (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(42) NOT NULL UNIQUE,
    total_holders INTEGER NOT NULL DEFAULT 0,
    new_holders_24h INTEGER NOT NULL DEFAULT 0,
    exited_holders_24h INTEGER NOT NULL DEFAULT 0,
    top_holder_percentage NUMERIC(5, 2) DEFAULT 0, -- Percentage held by top holder
    top_10_percentage NUMERIC(5, 2) DEFAULT 0, -- Percentage held by top 10
    gini_coefficient NUMERIC(5, 4) DEFAULT 0, -- Wealth distribution metric
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holder_statistics_token ON holder_statistics(token_address);

-- Add holders_count column to tokens table if it doesn't exist
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS holders_count INTEGER DEFAULT 0;

-- Function: update_holder_statistics
-- Updates aggregated statistics for a token
CREATE OR REPLACE FUNCTION update_holder_statistics(p_token_address VARCHAR)
RETURNS VOID AS $$
DECLARE
    v_total_holders INTEGER;
    v_total_supply NUMERIC;
    v_top_balance NUMERIC;
    v_top_10_balance NUMERIC;
BEGIN
    -- Count total holders
    SELECT COUNT(*) INTO v_total_holders
    FROM token_holders
    WHERE token_address = p_token_address
    AND balance > 0;
    
    -- Get total supply
    SELECT SUM(balance) INTO v_total_supply
    FROM token_holders
    WHERE token_address = p_token_address;
    
    -- Get top holder balance
    SELECT COALESCE(MAX(balance), 0) INTO v_top_balance
    FROM token_holders
    WHERE token_address = p_token_address;
    
    -- Get top 10 holders balance
    SELECT COALESCE(SUM(balance), 0) INTO v_top_10_balance
    FROM (
        SELECT balance
        FROM token_holders
        WHERE token_address = p_token_address
        ORDER BY balance DESC
        LIMIT 10
    ) t;
    
    -- Update or insert statistics
    INSERT INTO holder_statistics (
        token_address,
        total_holders,
        top_holder_percentage,
        top_10_percentage,
        last_updated
    ) VALUES (
        p_token_address,
        v_total_holders,
        CASE WHEN v_total_supply > 0 THEN (v_top_balance * 100 / v_total_supply) ELSE 0 END,
        CASE WHEN v_total_supply > 0 THEN (v_top_10_balance * 100 / v_total_supply) ELSE 0 END,
        NOW()
    )
    ON CONFLICT (token_address)
    DO UPDATE SET
        total_holders = EXCLUDED.total_holders,
        top_holder_percentage = EXCLUDED.top_holder_percentage,
        top_10_percentage = EXCLUDED.top_10_percentage,
        last_updated = NOW();
    
    -- Update tokens table holder count
    UPDATE tokens
    SET holders_count = v_total_holders
    WHERE address = p_token_address;
END;
$$ LANGUAGE plpgsql;

-- Function: get_holder_rank
-- Gets the rank of a holder for a specific token
CREATE OR REPLACE FUNCTION get_holder_rank(p_token_address VARCHAR, p_holder_address VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    v_rank INTEGER;
BEGIN
    SELECT rank INTO v_rank
    FROM (
        SELECT 
            address,
            RANK() OVER (ORDER BY balance DESC) as rank
        FROM token_holders
        WHERE token_address = p_token_address
        AND balance > 0
    ) ranked
    WHERE address = p_holder_address;
    
    RETURN COALESCE(v_rank, 0);
END;
$$ LANGUAGE plpgsql;

-- View: token_holder_summary
-- Provides a summary view of holder data for each token
CREATE OR REPLACE VIEW token_holder_summary AS
SELECT 
    t.address as token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    COALESCE(h.holder_count, 0) as holders,
    COALESCE(h.avg_balance, 0) as avg_balance,
    COALESCE(h.median_balance, 0) as median_balance,
    COALESCE(s.top_holder_percentage, 0) as top_holder_percentage,
    COALESCE(s.top_10_percentage, 0) as top_10_percentage
FROM tokens t
LEFT JOIN (
    SELECT 
        token_address,
        COUNT(*) as holder_count,
        AVG(balance) as avg_balance,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY balance) as median_balance
    FROM token_holders
    WHERE balance > 0
    GROUP BY token_address
) h ON t.address = h.token_address
LEFT JOIN holder_statistics s ON t.address = s.token_address;

-- Grant permissions (adjust based on your database users)
GRANT SELECT, INSERT, UPDATE ON token_holders TO api_user;
GRANT SELECT, INSERT ON transfer_events TO api_user;
GRANT SELECT, INSERT, UPDATE ON holder_statistics TO api_user;
GRANT SELECT ON token_holder_summary TO api_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO api_user;