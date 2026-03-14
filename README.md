# Free Proxy List

一个高性能的代理节点验证与聚合系统，专为在内存极其受限的环境中运行而设计。

## ✨ 特性

### 🔥 核心能力

- **多源聚合** - 集成多个公开代理数据源，自动定时抓取更新
- **智能验证** - 双区域验证策略，支持 Global 和 China 两种验证模式
- **性能分级** - 自动测速并标记高性能节点（≥10MB/s）
- **内存优化** - 采用队列调度和批处理，在低内存环境下稳定运行
- **插件架构** - 可扩展的插件系统，轻松添加新的代理数据源

### 🌍 区域策略

- **Global 模式** - 验证 Google 和 Microsoft 连通性
- **China 模式** - 针对中国节点优化，验证 Microsoft 和华为连通性（Google 需失败）

### 📊 Web 界面

- 简洁的单页应用，支持实时状态查看
- 多格式订阅输出：Base64、Clash、V2Ray、Clash Provider
- 高级筛选：国家、协议、速度、延迟
- 分页浏览，支持排序

### 🔌 API 服务

- **RESTful API** - 完整的节点查询、统计、管理接口
- **订阅转换** - 支持多种客户端格式的动态订阅生成
- **管理接口** - 数据清理、凭据重置等运维操作

---

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18
- Docker（可选，推荐用于生产部署）

### 使用 Docker（推荐）

```bash
# 构建镜像
make build

# 运行容器（挂载配置和数据卷）
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/config.yml:/app/config.yml \
  -v $(pwd)/data:/app/data \
  --name free-proxy-list \
  free-proxy-list
```

或直接使用 Docker Compose（需自行创建 docker-compose.yml）：

```yaml
version: "3"
services:
  proxy-list:
    image: free-proxy-list
    ports:
      - "8080:8080"
    volumes:
      - ./config.yml:/app/config.yml
      - ./data:/app/data
    restart: unless-stopped
```

### 本地运行

```bash
# 安装依赖
npm ci

# 启动服务
npm start

# 开发模式（文件监听）
npm run dev
```

---

## 📁 项目结构

```
free-proxy-list/
├── src/
│   ├── index.js          # 应用入口，启动所有组件
│   ├── server.js         # Express Web 服务器 & API
│   ├── validator.js      # 核心验证引擎（多队列并发）
│   ├── scheduler.js      # 插件调度器与节点导入
│   ├── db.js             # SQLite 数据库初始化与查询
│   ├── config.js         # 配置加载与合并
│   ├── speedtest.js      # 测速模块
│   ├── maintenance.js    # 清理过期日志
│   └── auth.js           # 管理员认证
├── plugins/              # 插件目录（可扩展）
│   ├── freeproxylist/    # FreeProxyList 数据源
│   ├── proxyscrape/      # ProxyScrape 数据源
│   ├── freeproxylist-cn/ # FreeProxyList 中国节点
│   ├── proxyscrape-cn/   # ProxyScrape 中国节点
│   ├── freeproxy/        # FreeProxy 数据源
│   └── freeproxyworld/   # FreeProxyWorld 数据源
├── public/
│   └── index.html        # Web 控制台
├── data/                 # 持久化数据（SQLite 数据库）
├── config.yml            # 配置文件
├── Dockerfile            # 容器镜像定义
├── Makefile              # 便捷操作命令
└── package.json          # 依赖与脚本
```

---

## ⚙️ 配置

配置文件 `config.yml` 支持以下选项：

### 应用配置 (app)

| 参数        | 说明                            | 默认值                |
| ----------- | ------------------------------- | --------------------- |
| `port`      | HTTP 服务端口                   | `8080`                |
| `log_level` | 日志等级: debug/info/warn/error | `info`                |
| `db_path`   | SQLite 数据库路径               | `./data/proxy.sqlite` |

### 运行时参数 (runtime)

| 参数                          | 说明                       | 默认值              |
| ----------------------------- | -------------------------- | ------------------- |
| `validation_concurrency`      | 验证并发线程数（最大 32）  | `8`                 |
| `delay_between_tests`         | 相邻验证任务等待时间（ms） | `0`                 |
| `timeout_threshold`           | 网络操作超时（ms）         | `5000`              |
| `max_retries`                 | 单节点最大重试次数         | `5`                 |
| `speedtest_timeout`           | 测速超时（ms）             | `10000`             |
| `speedtest_concurrency`       | 测速并发线程数（最大 8）   | `1`                 |
| `high_performance_min_bps`    | 高性能阈值（Bytes/s）      | `10485760` (10MB/s) |
| `recheck_interval`            | 存活节点复检间隔（ms）     | `14400000` (4h)     |
| `purge_deleted_logs_interval` | 删除日志清理间隔（ms）     | `86400000` (24h)    |
| `plugin_interval_seconds`     | 插件执行间隔（秒）         | `10800` (3h)        |

### 插件配置 (plugins)

每个插件可独立启用/禁用，并指定 `region`（global/cn）：

```yaml
plugins:
  - name: "freeproxylist"
    enabled: true
    entry: "plugins/freeproxylist/main.js"
    region: "global"
```

**插件输出格式**：插件需将提取的节点数组序列化为 JSON 并写入临时文件，将文件路径输出到 stdout。系统会读取该文件并入库。

---

## 🌐 API 接口

### 统计查询

```
GET /api/stats         # 全局统计
GET /api/cn/stats      # 中国区统计
```

响应示例：

```json
{
  "success": true,
  "data": {
    "readyCount": 1500,
    "availableCount": 3200,
    "highPerfCount": 450,
    "deletedLogsCount": 890
  }
}
```

### 节点列表

```
GET /api/nodes/available       # 可用 + 高性能（默认排序）
GET /api/nodes/highperf       # 仅高性能
GET /api/cn/nodes/available   # 中国区可用
GET /api/cn/nodes/highperf    # 中国区高性能
```

查询参数：

- `limit` (1-1000)
- `page`

### 订阅转换（核心）

```
GET /api/subconverter                    # 全局订阅
GET /api/cn/subconverter                 # 中国区订阅
```

查询参数：

| 参数      | 说明                                            | 默认值      |
| --------- | ----------------------------------------------- | ----------- |
| `target`  | 输出格式: base64/clash/v2ray/clash-provider/raw | `base64`    |
| `list`    | 列表类型: available/highperf                    | `available` |
| `country` | 国家代码（如 US、CN）                           | -           |
| `type`    | 协议: http/https/socks4/socks5                  | -           |
| `speed`   | 最小速度（KB/s）                                | -           |
| `delay`   | 最大延迟（ms）                                  | -           |
| `sort`    | 排序字段                                        | `status`    |
| `order`   | 排序方向: ASC/DESC                              | `DESC`      |
| `page`    | 页码                                            | `1`         |
| `limit`   | 每页数量                                        | `500`       |
| `udp`     | v2ray 模式下是否支持 UDP (true/false)           | `false`     |

**格式说明**：

- `base64` - 标准节点列表的 Base64 编码（兼容 Shadowrocket）
- `clash` - Clash 完整配置（含 proxy-groups）
- `clash-provider` - Clash Provider 格式（仅 proxies 部分）
- `v2ray` - V2Ray 格式，Base64 编码的 JSON
- `raw` - 原始 JSON 数组

### 管理员接口（需认证）

```
POST /api/admin/clear
POST /api/admin/reset-creds
```

请求体：

```json
{
  "uuid": "从日志中获取的管理员 UUID",
  "token": "从日志中获取的会话令牌"
}
```

---

## 🖥️ Web 控制台

访问 `http://localhost:8080` 使用 Web 界面：

- **实时统计** - 显示 Ready/Available/High-Perf/Purged 数量
- **高级筛选** - 按国家、协议、速度、延迟过滤
- **多格式输出** - 一键复制订阅链接
- **区域切换** - Global / China 双区域独立视图
- **管理功能** - 数据清理、凭据重置（需管理员凭据）

---

## 🔧 开发指南

### 添加新插件

1. 在 `plugins/` 目录下创建子目录，编写主程序（如 `main.js`）

2. 插件需满足以下约定：
   - 通过 `process.argv` 接收参数（系统自动传递）
   - 完成抓取后，将节点数组写入临时文件
   - 将临时文件路径打印到 stdout（`console.log(path)`）
   - 正常退出 `process.exit(0)`
   - 失败时输出空文件路径，确保系统不会阻塞

3. 节点对象格式：

```javascript
{
  protocol: "http" | "https" | "socks4" | "socks5",
  ip: "1.2.3.4",
  port: 8080,
  shortName: "US_NewYork",    // 可选，国家_城市
  longName: "United States New York",
  remark: "插件名称"           // 可选
}
```

1. 在 `config.yml` 中注册插件：

```yaml
plugins:
  - name: "myplugin"
    enabled: true
    entry: "plugins/myplugin/main.js"
    region: "global"
```

### 数据库优化

- 使用 WAL 模式支持并发读写
- 复合索引优化查询性能
- 批量事务写入降低锁竞争
- 异步清理避免阻塞主流程

---

## 🐳 Docker 部署

### 生产建议

```bash
# 1. 准备配置
cp config.yml docker-compose.yml  # 按需修改

# 2. 数据目录（持久化）
mkdir -p data

# 3. 启动
docker-compose up -d
```

### 环境变量覆盖

| 环境变量                 | 覆盖项                           | 说明       |
| ------------------------ | -------------------------------- | ---------- |
| `PORT`                   | `app.port`                       | 服务端口   |
| `VALIDATION_CONCURRENCY` | `runtime.validation_concurrency` | 验证并发数 |
| `SPEEDTEST_CONCURRENCY`  | `runtime.speedtest_concurrency`  | 测速并发数 |

---

## 🔍 验证策略详解

### Global 验证流程

1. **Ping 测试** - TCP 连接建立时间 ≤ 5000ms
2. **三网站验证** - 并发请求：
   - `https://www.google.com/generate_204`
   - `http://www.microsoft.com/pki/mscorp/cps`
   - `http://connectivitycheck.platform.hicloud.com/generate_204`
3. **通过条件** - Google 和 Microsoft 均成功（200-399），Huawei 成功与否不计

### China 验证流程

1. **Ping 测试** - 同上
2. **三网站验证** - 同上
3. **通过条件** - Google 必须失败（超时/错误），Microsoft 和 Huawei 均成功

---

## 📊 节点状态说明

| 状态码 | 名称      | 说明                       |
| ------ | --------- | -------------------------- |
| 0      | Ready     | 待验证（新导入或超期未检） |
| 1      | Available | 验证通过，普通可用         |
| 2      | High-Perf | 高性能节点（≥10MB/s）      |

---

## 🛠️ 故障排查

### 日志位置

- 标准输出（stdout/stderr）- Docker 查看：`docker logs free-proxy-list`
- 默认日志等级 `info`，调试时改为 `debug`

### 常见问题

**Q: 数据库锁死？**
A: 程序已启用 WAL 模式和 busy_timeout。若频繁写入，可降低 `plugin_interval_seconds` 或调整批次大小。

**Q: 验证总是超时？**
A: 检查网络出口 IP 是否被目标网站封禁，或调整 `timeout_threshold`。

**Q: 插件执行失败？**
A: 检查插件文件是否存在、权限是否正确、node 版本是否符合要求。

**Q: 内存占用过高？**
A: 降低 `validation_concurrency` 和 `speedtest_concurrency`，或增加 `delay_between_tests`。

---

## 📖 参考链接

- 项目仓库: <https://github.com/RainPPR/free-proxy-list>
- 数据源参考：
  - [proxifly/free-proxy-list](https://github.com/proxifly/free-proxy-list)
  - [proxyscrape.com](https://proxyscrape.com/)
  - [free-proxy-list.net](https://free-proxy-list.net/)

---

## 📝 待办事项

- [ ] 更多数据源插件
- [ ] 节点质量评分算法
- [ ] WebSocket 实时推送
- [ ] 多语言界面支持
