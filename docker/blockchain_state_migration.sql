-- Migration to add blockchain_state table
CREATE TABLE IF NOT EXISTS blockchain_state (
  id SERIAL PRIMARY KEY,
  processor VARCHAR(50) NOT NULL,
  last_block INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blockchain_state_processor ON blockchain_state(processor);

-- Insert initial records for existing processors
INSERT INTO blockchain_state (processor, last_block)
VALUES 
  ('meme_factory', 0),
  ('staking', 0),
  ('treasury', 0)
ON CONFLICT (processor) DO NOTHING;
