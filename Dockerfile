# syntax=docker/dockerfile:1
FROM node:slim AS builder

# 安装构建依赖 (better-sqlite3 编译需要 python3, make, g++)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY package.json package-lock.json* ./

# npm ci --omit=dev 将只安装 dependencies
RUN npm install --omit=dev

# Production Stage
FROM node:slim

# 安装运行时需要的 Python 及工具
# 注意：Node.js 环境已经存在，这里额外引入 python3 和 pip 保障 Python 插件运行
RUN apt-get update && apt-get install -y python3 pip tcpdump curl && \
    mkdir -p /app/data && \
    mkdir -p /app/plugins && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从 builder 复制已编译好的 node_modules 过来
COPY --from=builder /build/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY plugins/ ./plugins/
COPY config.yml ./

# 环境暴露配置
ENV PORT=8080
EXPOSE 8080

# 以非拉高权限启动
CMD ["node", "src/index.js"]