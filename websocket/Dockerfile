# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json ./
# Package manifests for required workspaces
COPY websocket/package.json websocket/package.json
COPY shared/package.json shared/package.json
# Copy root tsconfig base
COPY tsconfig.base.json ./

# Install only the needed workspaces and their deps
RUN pnpm install --filter @core-meme/websocket-server... --filter @core-meme/shared...

# Copy sources for build
COPY shared ./shared
COPY websocket ./websocket

# Build shared workspace first
WORKDIR /app/shared
RUN pnpm run build

# Build the websocket package
WORKDIR /app/websocket
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json ./
COPY websocket/package.json websocket/package.json
COPY shared/package.json shared/package.json
# Copy root tsconfig base (for any runtime tooling that references it)
COPY tsconfig.base.json ./

# Install production deps for websocket and shared
RUN pnpm install --prod --filter @core-meme/websocket-server... --filter @core-meme/shared...

# Copy built application
COPY --from=builder /app/websocket/dist ./websocket/dist
COPY --from=builder /app/shared/dist ./shared/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change to non-root user
USER nodejs

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Run from websocket workspace
WORKDIR /app/websocket

# Start the application
CMD ["node", "dist/index.js"]