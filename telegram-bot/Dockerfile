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
COPY telegram-bot/package.json telegram-bot/package.json
COPY telegram-bot/tsconfig.json telegram-bot/tsconfig.json
COPY shared/package.json shared/package.json

# Install only needed workspaces and their deps
RUN pnpm install --filter @core-meme/telegram-bot... --filter @core-meme/shared...

# Copy sources for build
COPY shared ./shared
COPY telegram-bot ./telegram-bot

# Build the application
WORKDIR /app/telegram-bot
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json ./
# Copy root tsconfig base (for any runtime tooling that references it)
COPY tsconfig.base.json ./
COPY telegram-bot/package.json telegram-bot/package.json
COPY shared/package.json shared/package.json

# Install production dependencies only for the selected workspaces
RUN pnpm install --prod --filter @core-meme/telegram-bot... --filter @core-meme/shared...

# Copy built application from builder
COPY --from=builder /app/telegram-bot/dist /app/telegram-bot/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Health check (no HTTP endpoint; check process)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD pgrep -f "node dist/bot.js" > /dev/null || exit 1

# Run from service workspace dir
WORKDIR /app/telegram-bot

# Start the telegram bot
CMD ["node", "dist/bot.js"]