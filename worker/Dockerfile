FROM node:24-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

RUN mkdir -p /app/data && chown -R node:node /app

COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node . ./

ENV APP_ENV=production
ENV WORKER_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://localhost:" + (process.env.WORKER_PORT || 8080) + "/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["node", "index.js"]

