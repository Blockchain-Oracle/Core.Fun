-- STRICT IMPLEMENTATION: Add ALL missing columns to tokens table
-- NO FIELD CAN BE SKIPPED

-- Add image_url column for token images
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add trading control columns
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS max_wallet NUMERIC DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS max_transaction NUMERIC DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS trading_enabled BOOLEAN DEFAULT true;

-- Add bonding curve progress tracking
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS bonding_curve_progress NUMERIC DEFAULT 0;

-- Add metadata tracking
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP;

-- Add launch block for anti-snipe tracking
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS launch_block INTEGER DEFAULT 0;

-- Add sold and raised amounts for bonding curve
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS sold NUMERIC DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS raised NUMERIC DEFAULT 0;

-- Add target amount for graduation
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS target_amount NUMERIC DEFAULT 3;

-- Add price fields
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS current_price NUMERIC DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS price_impact NUMERIC DEFAULT 0;

-- Add holder analytics
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS unique_traders_24h INTEGER DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS whale_count INTEGER DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS dolphin_count INTEGER DEFAULT 0;

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS fish_count INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_is_launched ON tokens(is_launched);
CREATE INDEX IF NOT EXISTS idx_tokens_bonding_progress ON tokens(bonding_curve_progress);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator_address);

-- Add comment to track schema version
COMMENT ON TABLE tokens IS 'Token table with COMPLETE metadata support - v2.0';

-- Create a new table for price history if it doesn't exist
CREATE TABLE IF NOT EXISTS token_price_history (
  id SERIAL PRIMARY KEY,
  token_address VARCHAR(42) NOT NULL,
  price NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  holders_count INTEGER,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (token_address) REFERENCES tokens(address) ON DELETE CASCADE,
  INDEX idx_price_history_token (token_address),
  INDEX idx_price_history_timestamp (timestamp)
);

-- Create a table for holder snapshots
CREATE TABLE IF NOT EXISTS token_holder_snapshots (
  id SERIAL PRIMARY KEY,
  token_address VARCHAR(42) NOT NULL,
  holder_address VARCHAR(42) NOT NULL,
  balance NUMERIC NOT NULL,
  share_percentage NUMERIC NOT NULL,
  snapshot_timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (token_address) REFERENCES tokens(address) ON DELETE CASCADE,
  INDEX idx_holder_token (token_address),
  INDEX idx_holder_address (holder_address),
  INDEX idx_holder_timestamp (snapshot_timestamp)
);

-- Update existing records to have default values for new columns
UPDATE tokens 
SET 
  image_url = COALESCE(image_url, ''),
  max_wallet = COALESCE(max_wallet, 0),
  max_transaction = COALESCE(max_transaction, 0),
  trading_enabled = COALESCE(trading_enabled, true),
  bonding_curve_progress = COALESCE(bonding_curve_progress, 0),
  metadata_updated_at = COALESCE(metadata_updated_at, CURRENT_TIMESTAMP),
  launch_block = COALESCE(launch_block, 0),
  sold = COALESCE(sold, 0),
  raised = COALESCE(raised, 0),
  target_amount = COALESCE(target_amount, 3),
  current_price = COALESCE(current_price, 0),
  price_impact = COALESCE(price_impact, 0),
  unique_traders_24h = COALESCE(unique_traders_24h, 0),
  whale_count = COALESCE(whale_count, 0),
  dolphin_count = COALESCE(dolphin_count, 0),
  fish_count = COALESCE(fish_count, 0)
WHERE image_url IS NULL 
   OR max_wallet IS NULL 
   OR max_transaction IS NULL;