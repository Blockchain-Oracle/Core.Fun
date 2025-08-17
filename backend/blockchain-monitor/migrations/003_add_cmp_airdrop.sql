-- Migration: Add CMP airdrop tracking to users table
-- Date: 2025-08-16
-- Purpose: Track if users have claimed their initial 1000 CMP tokens

-- Add column to track if user has claimed initial CMP airdrop
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS claimed_initial_cmp BOOLEAN DEFAULT FALSE;

-- Add column to track when they claimed
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS claimed_cmp_at TIMESTAMP WITH TIME ZONE;

-- Add column to track the transaction hash
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS cmp_airdrop_tx_hash VARCHAR(66);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_claimed_initial_cmp ON users(claimed_initial_cmp);

-- Update existing users to show they haven't claimed yet
UPDATE users SET claimed_initial_cmp = FALSE WHERE claimed_initial_cmp IS NULL;

COMMENT ON COLUMN users.claimed_initial_cmp IS 'Whether user has claimed their one-time 1000 CMP airdrop';
COMMENT ON COLUMN users.claimed_cmp_at IS 'Timestamp when user claimed their initial CMP tokens';
COMMENT ON COLUMN users.cmp_airdrop_tx_hash IS 'Transaction hash of the CMP airdrop transfer';