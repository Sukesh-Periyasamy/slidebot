# ─────────────────────────────────────────────────────────────────────────────
# SlideBot API — Multi-stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Base with pnpm
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Stage 2: Dependencies installer
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-schemas/package.json ./packages/shared-schemas/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY tooling/ ./tooling/
RUN pnpm install --frozen-lockfile

# Stage 3: Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter=@slidebot/shared-types build
RUN pnpm --filter=@slidebot/shared-schemas build
RUN pnpm --filter=@slidebot/shared-utils build
RUN pnpm --filter=@slidebot/api build
RUN pnpm --filter=@slidebot/api exec prisma generate

# Stage 4: Production runner
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]

# Stage 5: Development (with hot reload)
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["pnpm", "--filter=@slidebot/api", "dev"]
