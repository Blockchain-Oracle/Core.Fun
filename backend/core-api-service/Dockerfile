# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests from repo root
COPY pnpm-workspace.yaml package.json ./
# Copy package manifests for needed workspaces
COPY backend/core-api-service/package.json backend/core-api-service/package.json
COPY backend/core-api-service/tsconfig.json backend/core-api-service/tsconfig.json
COPY shared/package.json shared/package.json

# Install only needed workspaces and their deps
RUN pnpm install --filter @core-meme-platform/core-api-service... --filter @core-meme/shared...

# Copy sources
COPY shared ./shared
COPY backend/core-api-service ./backend/core-api-service

# Build the application
WORKDIR /app/backend/core-api-service
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json ./
COPY backend/core-api-service/package.json backend/core-api-service/package.json
COPY shared/package.json shared/package.json

# Install production deps for selected workspaces
RUN pnpm install --prod --filter @core-meme-platform/core-api-service... --filter @core-meme/shared...

# Copy built application
COPY --from=builder /app/backend/core-api-service/dist /app/backend/core-api-service/dist

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Run from service workspace dir
WORKDIR /app/backend/core-api-service

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]