# syntax=docker/dockerfile:1

# ---------- base (development) ----------
FROM node:22-slim AS base
WORKDIR /home/node/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# ---------- build ----------
FROM base AS build
RUN npm run build
RUN npm prune --omit=dev

# ---------- production ----------
FROM node:22-slim AS production
WORKDIR /home/node/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_PATH=./build

COPY --from=build /home/node/app/node_modules ./node_modules
COPY --from=build /home/node/app/build ./build
COPY --from=build /home/node/app/package.json ./package.json

USER node
CMD ["node", "build/src/index.js"]
