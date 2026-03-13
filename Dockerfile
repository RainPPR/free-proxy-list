# syntax=docker/dockerfile:1
FROM pyd4vinci/scrapling:latest

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 make g++ pip tcpdump curl nodejs npm tini && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

RUN --mount=type=bind,source=.python-version,target=.python-version \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-cache && \
    uv run scrapling install --force

COPY package.json ./
RUN --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=bind,source=pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=cache,id=pnpm,target=/pnpm/store\
    corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm install --frozen-lockfile

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