# Build stage
FROM node:20-slim AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy all package.json files for dependency resolution
COPY apps/sync-worker/package.json ./apps/sync-worker/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/sync-worker/ ./apps/sync-worker/
COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY packages/services/ ./packages/services/

# Build sync-worker and its dependencies (Turborepo handles dependency order)
RUN pnpm turbo run build --filter=@kawakawa/sync-worker...

# Production stage
FROM node:20-slim AS production

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json files
COPY apps/sync-worker/package.json ./apps/sync-worker/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/apps/sync-worker/dist ./apps/sync-worker/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/services/dist ./packages/services/dist

# Set environment
ENV NODE_ENV=production

# Run from the app root (monorepo structure preserved)
CMD ["node", "apps/sync-worker/dist/index.js"]
