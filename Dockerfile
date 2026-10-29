# OxaSmash game server: serves the built game (dist/) and runs online rooms over WebSockets (/ws).
#   docker build -t esjotace/oxasmash:latest .
#   docker run -p 8787:8787 esjotace/oxasmash:latest

# ---- Build the page (needs the dev dependencies: Vite) --------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.* ./
COPY public ./public
COPY src ./src

# The version and build show in the corner of the menu.
ARG VERSION=dev
ARG BUILD=
RUN VITE_APP_VERSION=$VERSION VITE_APP_BUILD=$BUILD npm run build

# ---- Run the server ------------------------------------------------------------------------
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app

# Dependencies first so they stay cached when only game code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server runs the same rules code as the page (src/sim, src/bots, src/net, src/game/cast.js).
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist

ARG VERSION=dev
ARG BUILD=
ENV APP_VERSION=$VERSION APP_BUILD=$BUILD
LABEL org.opencontainers.image.title="OxaSmash" \
      org.opencontainers.image.description="Gun-fu platform fighter for the browser, with online rooms" \
      org.opencontainers.image.version=$VERSION

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health > /dev/null || exit 1

CMD ["node", "server/index.js"]
