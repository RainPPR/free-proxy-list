# syntax=docker/dockerfile:1

# 阶段 1：编译/依赖安装阶段
FROM node:24-trixie-slim AS dependencies

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# 安装构建时需要的依赖
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 make g++ curl

COPY package.json package-lock.json* ./

# 安装生产依赖
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# 阶段 2：构建阶段 (包含应用代码)
FROM dependencies AS builder
COPY . .
RUN mkdir -p /app/data

# 阶段 3：运行阶段
FROM node:24-trixie-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# 生产环境只需 tini 和 curl (健康检查用)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        tini curl && \
    rm -rf /var/lib/apt/lists/*

# 从构建阶段复制所有文件
COPY --from=builder /app /app

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]