# syntax=docker/dockerfile:1

# 使用 Bun 镜像
FROM oven/bun:1-debian AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json bun.lockb* ./

# 安装依赖（使用 bun install）
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用（生成 bytecode + compile 可执行文件）
RUN bun run build.js exe

# 运行阶段
FROM oven/bun:1-debian

ENV NODE_ENV=production \
    PORT=8080 \
    TMPDIR=/app/data/temp

WORKDIR /app

# 复制构建产物（可执行文件和静态资源）
COPY --from=builder /app/dist /app

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 8080

# 直接运行编译后的可执行文件
CMD ["./index"]
