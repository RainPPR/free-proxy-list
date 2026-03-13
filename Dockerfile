# syntax=docker/dockerfile:1
FROM pyd4vinci/scrapling:latest

# 安装运行时需要的 Python 及工具
# 注意：Node.js 环境已经存在，这里额外引入 python3 和 pip 保障 Python 插件运行
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        python3 make g++ pip tcpdump curl nodejs npm tini && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

RUN --mount=type=bind,source=.python-version,target=.python-version \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-cache && uv run scrapling install  --force

COPY package.json pnpm-lock.yaml ./
RUN pnpm ci

COPY src/ ./src/
COPY public/ ./public/
COPY plugins/ ./plugins/
COPY config.yml ./

# 环境暴露配置
ENV PORT=8080
EXPOSE 8080

# 以非拉高权限启动
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]