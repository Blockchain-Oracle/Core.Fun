# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY telegram-bot/package.json ./telegram-bot/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY shared ./shared
COPY telegram-bot ./telegram-bot

# Build shared and telegram bot
WORKDIR /app/shared
RUN pnpm build

WORKDIR /app/telegram-bot
RUN pnpm build

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/telegram-bot ./telegram-bot

WORKDIR /app/telegram-bot

# Create logs directory
RUN mkdir -p logs

EXPOSE 3004

CMD ["node", "dist/bot.js"]