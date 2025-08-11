# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests from repo root
COPY pnpm-workspace.yaml package.json ./
# Copy root tsconfig base
COPY tsconfig.base.json ./
# Copy package manifests for required workspaces
COPY backend/blockchain-monitor/package.json backend/blockchain-monitor/package.json
COPY backend/blockchain-monitor/tsconfig.json backend/blockchain-monitor/tsconfig.json
COPY shared/package.json shared/package.json

# Install only needed workspaces and their deps
RUN pnpm install --filter @core-meme-platform/blockchain-monitor... --filter @core-meme/shared...

# Copy sources for build
COPY shared ./shared
COPY backend/blockchain-monitor ./backend/blockchain-monitor

# Build the application
WORKDIR /app/backend/blockchain-monitor
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json ./
# Copy root tsconfig base
COPY tsconfig.base.json ./
COPY backend/blockchain-monitor/package.json backend/blockchain-monitor/package.json
COPY shared/package.json shared/package.json

# Install production dependencies only for the selected workspaces
RUN pnpm install --prod --filter @core-meme-platform/blockchain-monitor... --filter @core-meme/shared...

# Copy built application from builder
COPY --from=builder /app/backend/blockchain-monitor/dist /app/backend/blockchain-monitor/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create logs directory and set ownership
RUN mkdir -p /app/backend/blockchain-monitor/logs && chown -R nodejs:nodejs /app

USER nodejs

# Health check (no HTTP endpoint; check process)
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD pgrep -f "node dist/main.js" > /dev/null || exit 1

# Run from service workspace dir
WORKDIR /app/backend/blockchain-monitor

# Start the blockchain monitor
CMD ["node", "dist/main.js"]