# UOS Poker — single Railway service (server + built SPA).
FROM node:22-slim AS build
# Prisma engines need openssl at build (generate) and runtime (queries).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Install with the lockfile against just the manifests first (better caching).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# Full source, then generate the Prisma client and build the SPA.
COPY . .
RUN pnpm --filter @uos-poker/server db:generate
RUN pnpm --filter @uos-poker/web build

ENV NODE_ENV=production
EXPOSE 3001
# Runs `prisma migrate deploy` then boots the server (tsx at runtime —
# the workspace packages export TS source directly; see CLAUDE.md/NOTES.md).
CMD ["pnpm", "--filter", "@uos-poker/server", "start:prod"]
