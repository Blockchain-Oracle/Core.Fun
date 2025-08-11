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
COPY backend/trading-engine/package.json backend/trading-engine/package.json
COPY shared/package.json shared/package.json

# Install only needed workspaces and their deps
RUN pnpm install --filter @core-meme-platform/trading-engine... --filter @core-meme/shared...

# Copy sources for build
COPY shared ./shared
COPY backend/trading-engine ./backend/trading-engine

# Build the application
WORKDIR /app/backend/trading-engine
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
COPY backend/trading-engine/package.json backend/trading-engine/package.json
COPY shared/package.json shared/package.json

# Install production dependencies only for the selected workspaces
RUN pnpm install --prod --filter @core-meme-platform/trading-engine... --filter @core-meme/shared...

# Copy built application from builder
COPY --from=builder /app/backend/trading-engine/dist /app/backend/trading-engine/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose trading engine port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Run from the service workspace directory
WORKDIR /app/backend/trading-engine

# Start the trading engine server
CMD ["node", "dist/server.js"]