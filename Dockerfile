# Multi-stage Dockerfile for Core Meme Platform Monorepo
# This builds all services and runs them with PM2

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Install pnpm and turbo globally
RUN npm install -g pnpm@10.13.1 turbo@1.13.4

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY shared/package.json ./shared/
COPY backend/api/package.json ./backend/api/
COPY backend/websocket/package.json ./backend/websocket/
COPY backend/blockchain-monitor/package.json ./backend/blockchain-monitor/
COPY telegram-bot/package.json ./telegram-bot/
COPY contracts/package.json ./contracts/
COPY core.fun_Frontend/package.json ./core.fun_Frontend/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# Build all projects using turbo
RUN turbo run build

# Ensure Next.js standalone build for production
WORKDIR /app/core.fun_Frontend
RUN pnpm run build
WORKDIR /app

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache git && \
    npm install -g pm2@latest pnpm@10.13.1

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/ecosystem.config.js ./

# Copy all built services
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/telegram-bot ./telegram-bot
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/core.fun_Frontend ./core.fun_Frontend

# Copy startup script
COPY startup.sh ./
RUN chmod +x startup.sh

# Create necessary directories
RUN mkdir -p logs

# Expose all service ports
EXPOSE 3000 3001 3002 3003 3004 3005

# Start with startup script
CMD ["./startup.sh"]