# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG NPM_VERSION=11.12.1
RUN npm install -g npm@${NPM_VERSION}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ARG NPM_VERSION=11.12.1
RUN npm install -g npm@${NPM_VERSION}

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid 1001 --create-home app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/public/uploads /app/public/exports && chown -R app:nodejs /app

USER app
EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start"]
