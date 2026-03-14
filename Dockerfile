# syntax=docker/dockerfile:1

# 阶段 1：构建阶段
FROM node:24-trixie-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 make g++ curl

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# 阶段 2：运行阶段
FROM node:24-trixie-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DEBIAN_FRONTEND=noninteractive \
    TMPDIR=/app/data/temp

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        tini curl python3 && \
    rm -rf /var/lib/apt/lists/*

# 生产环境仅需 dist 目录 (内含 bundle、各插件 bundle 及 better_sqlite3.node)
COPY --from=builder /app/dist /app/dist

# 仍然需要这些基础底层 Addon 支撑结构
COPY --from=builder /app/node_modules/better-sqlite3 /app/node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings /app/node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path /app/node_modules/file-uri-to-path

# 其它静态资源与配置
COPY --from=builder /app/config.yml /app/config.yml
COPY --from=builder /app/public /app/public

RUN mkdir -p /app/data

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", \
     "--max-old-space-size=768", \
     "--max-semi-space-size=16", \
     "--optimize-for-size", \
     "--gc-interval=500", \
     "dist/bundle.cjs"]