# AGENTS.md

## Setup commands

## Dev environment tips

## Testing instructions

优先进行 bun run index.js 进行调试，这个命令是一个持久的服务，因此建议使用命令行命令设置一定时间（比如 30s 或者 60s，具体取决于你要调试什么）自动停止。

对于更加贴近生产的测试，使用 Dockerfile 构建，构建命令请查阅 Makefile 中的。

## Code style

## Notes

在 data 文件夹下面有一个 proxy.online.sqlite 文件，这个文件是我现在已经部署的上一个稳定版本的数据库，其中有大量可用且有意义的数据，当你调试到一定程度后，可以把这个复制并替换现在的 proxy.sqlite 并进行更贴近生产环境的测试。
