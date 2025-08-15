# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/blockchain-monitor/package.json ./backend/blockchain-monitor/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY shared ./shared
COPY backend/blockchain-monitor ./backend/blockchain-monitor

# Build shared and monitor
WORKDIR /app/shared
RUN pnpm build

WORKDIR /app/backend/blockchain-monitor
RUN pnpm build

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend/blockchain-monitor ./backend/blockchain-monitor

WORKDIR /app/backend/blockchain-monitor

# Create logs directory
RUN mkdir -p logs

EXPOSE 3003

CMD ["node", "dist/index.js"]