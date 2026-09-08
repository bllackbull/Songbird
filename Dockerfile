# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm ci --no-audit --no-fund --loglevel=verbose
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim AS server-deps
WORKDIR /app/server
# python3/make/g++ are required to compile native modules (bufferutil,
# utf-8-validate via telegram->ws) when no prebuilt binary is available,
# which happens on the emulated linux/arm64 build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm ci --omit=dev --no-audit --no-fund --loglevel=verbose

FROM node:24-bookworm-slim AS worker-deps
WORKDIR /app/worker
COPY worker/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm ci --omit=dev --no-audit --no-fund --loglevel=verbose

FROM node:24-bookworm-slim
WORKDIR /app

# ffmpeg is required for video transcoding and metadata extraction in the media worker
# postgresql-client (from PGDG apt repo) is required for PostgreSQL maintenance operations (backup, vacuum)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /etc/apt/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=worker-deps /app/worker/node_modules ./worker/node_modules
COPY worker/ ./worker/
COPY scripts/run-data-command.sh ./scripts/run-data-command.sh
RUN chmod 755 /app/scripts/run-data-command.sh
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod 755 /app/scripts/docker-entrypoint.sh
COPY --from=client-build /app/client/dist ./client/dist

# Root-level files needed at runtime for version info and changelog
COPY VERSION ./
COPY CHANGELOG.md ./
COPY package.json ./

RUN mkdir -p /app/data /app/data/uploads /app/data/backups

ENV APP_ENV=production
ENV SERVER_PORT=5174
ENV BIND_ADDRESS=0.0.0.0
EXPOSE 5174

# Health check for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || process.env.SERVER_PORT || 5174; require('http').get('http://localhost:' + port + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
