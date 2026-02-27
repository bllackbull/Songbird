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
COPY server/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm ci --omit=dev --no-audit --no-fund --loglevel=verbose

FROM node:24-bookworm-slim
WORKDIR /app

# ffmpeg is required when FILE_UPLOAD_TRANSCODE_VIDEOS=true (default)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

RUN mkdir -p /app/data /app/data/uploads /app/data/backups

ENV APP_ENV=production
ENV PORT=5174
EXPOSE 5174

CMD ["node", "server/index.js"]
