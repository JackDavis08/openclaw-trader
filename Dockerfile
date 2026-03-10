# ─── Stage 1: builder ───────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

# Root deps
COPY package.json package-lock.json ./
RUN npm ci

# Web deps + build
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build

# ─── Stage 2: runtime ──────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/node_modules ./web/node_modules
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/package.json ./web/package.json
COPY --from=builder /app/web/next.config.ts ./web/next.config.ts

COPY src/ ./src/
COPY config/ ./config/
COPY package.json tsconfig.json ./

EXPOSE 8080 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:8080/api/health || exit 1

CMD ["node", "node_modules/.bin/tsx", "src/scheduler.ts", "--dashboard", "--web"]
