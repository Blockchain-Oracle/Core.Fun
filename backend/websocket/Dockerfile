FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/websocket/package.json ./backend/websocket/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY shared ./shared
COPY backend/websocket ./backend/websocket

# Build shared package first
RUN cd shared && pnpm run build

# Build websocket service  
RUN cd backend/websocket && pnpm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/websocket/package.json ./backend/websocket/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/backend/websocket/dist ./backend/websocket/dist

# Create logs directory
RUN mkdir -p /app/backend/websocket/logs

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8081/health || exit 1

# Start the websocket server
CMD ["node", "backend/websocket/dist/server.js"]