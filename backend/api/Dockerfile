# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json ./shared/
COPY backend/api/package.json ./backend/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY shared ./shared
COPY backend/api ./backend/api

# Build shared and api
WORKDIR /app/shared
RUN pnpm build

WORKDIR /app/backend/api
RUN pnpm build

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend/api ./backend/api

WORKDIR /app/backend/api

# Create logs directory
RUN mkdir -p logs

EXPOSE 3001

CMD ["node", "dist/index.js"]