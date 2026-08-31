FROM node:24-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . ./

EXPOSE 8080

CMD ["node", "index.js"]
