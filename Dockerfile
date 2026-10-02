# syntax=docker/dockerfile:1
FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3003

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public

USER node
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server.js"]