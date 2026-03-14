# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS dependencies

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ curl

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

FROM dependencies AS builder
COPY . .
RUN mkdir -p /app/data

FROM node:24-trixie-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 8080

ENTRYPOINT ["node"]
CMD ["src/index.js"]