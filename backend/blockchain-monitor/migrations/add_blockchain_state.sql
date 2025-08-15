-- Create blockchain_state table for tracking processor states
CREATE TABLE IF NOT EXISTS blockchain_state (
    id SERIAL PRIMARY KEY,
    processor VARCHAR(50) NOT NULL UNIQUE,
    last_block INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_blockchain_state_processor ON blockchain_state(processor);

-- Insert initial state for staking processor if not exists
INSERT INTO blockchain_state (processor, last_block, updated_at)
VALUES ('staking', 0, CURRENT_TIMESTAMP)
ON CONFLICT (processor) DO NOTHING;