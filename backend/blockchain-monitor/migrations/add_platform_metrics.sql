-- Create platform_metrics table for tracking platform metrics including revenue distribution
CREATE TABLE IF NOT EXISTS platform_metrics (
    id SERIAL PRIMARY KEY,
    metric_type VARCHAR(100) NOT NULL,
    value DECIMAL(20, 8) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_platform_metrics_type ON platform_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_timestamp ON platform_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_type_timestamp ON platform_metrics(metric_type, timestamp DESC);