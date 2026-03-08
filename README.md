# Free Proxy List

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node.js-20+-green)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-supported-blue)](https://www.docker.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

一个高质量的免费代理聚合、验证与订阅服务平台。自动从多个源抓取代理节点，并发验证可用性与速度，并提供多格式订阅输出。

## ✨ 特性

- **多源聚合**: 集成 3+ 个免费代理源（freeproxylist, proxyscrape, freeproxy）
- **智能排序**: 导入时按协议优先级（SOCKS5/4 > HTTPS > HTTP）、国家优先级、信息完整度三级排序
- **多线程验证**: 支持并发验证（默认 8 线程）和测速（默认 2 线程）
- **多格式订阅**: 支持 Base64、Clash、V2Ray、Clash Provider 四种订阅格式
- **多列表类型**: 全部、仅可用、仅高性能三种列表
- **智能去重**: 基于内容哈希自动去重，避免重复导入
- **WAL 模式**: SQLite WAL 模式支持高并发读写
- **Docker 部署**: 提供开箱即用的 Docker 镜像
- **Web 面板**: 内置实时统计与节点展示界面
- **可配置调度**: 插件执行间隔可配置（默认 6 小时）

## 🗂️ 项目结构

```tree
free-proxy-list/
├── src/
│   ├── index.js          # 应用入口
│   ├── server.js         # Web 服务器 & API
│   ├── scheduler.js      # 插件调度器
│   ├── validator.js      # 验证引擎
│   ├── speedtest.js      # 测速引擎
│   ├── maintenance.js    # 维护清理
│   ├── db.js             # 数据库层
│   └── config.js         # 配置管理
├── plugins/
│   ├── freeproxylist/    # free-proxy-list.net 插件
│   ├── proxyscrape/      # proxyscrape.com 插件
│   └── freeproxy/        # free-proxy-list.net 多页面插件
├── public/
│   └── index.html        # Web 控制台
├── config.yml            # 主配置文件
├── Dockerfile            # Docker 镜像构建
├── Makefile              # 构建与开发命令
├── package.json          # Node.js 依赖
└── data/                 # 数据目录（SQLite + 日志）
```

## 🚀 快速开始

### 使用 Docker（推荐）

```bash
# 拉取镜像（如有）
docker pull free-proxy-list:latest

# 运行容器
docker run -d \
  --name free-proxy-list \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  free-proxy-list:latest

# 查看日志
docker logs -f free-proxy-list
```

访问：<http://localhost:8080>

### 本地运行

```bash
# 1. 克隆代码
git clone https://github.com/yourusername/free-proxy-list.git
cd free-proxy-list

# 2. 安装依赖
npm ci --only=production

# 3. 准备数据目录
mkdir -p data

# 4. 启动服务
npm start

# 或使用 Makefile
make run
```

访问：<http://localhost:3000（默认端口）>

## ⚙️ 配置

编辑根目录下的 `config.yml`：

```yaml
app:
  port: 8080
  dbPath: ./data/proxy.sqlite
  logLevel: info
  proxyValidationTimeoutMs: 8000
  highPerformanceMinBps: 1048576 # 1 MB/s

scheduler:
  pluginIntervalSeconds: 21600 # 6 小时

plugins:
  - name: "freeproxylist"
    enabled: true
    entry: "plugins/freeproxylist/main.js"
    command: "node"
  - name: "proxyscrape"
    enabled: true
    entry: "plugins/proxyscrape/index.js"
    command: "node"
  - name: "freeproxy"
    enabled: true
    entry: "plugins/freeproxy/main.js"
    command: "node"
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
| ------ | ---- | ------ | ---- |
| `app.port` | number | 8080 | Web 服务端口 |
| `app.dbPath` | string | ./data/proxy.sqlite | SQLite 数据库路径 |
| `app.logLevel` | string | info | 日志级别 |
| `app.proxyValidationTimeoutMs` | number | 8000 | 验证超时（毫秒） |
| `app.highPerformanceMinBps` | number | 1048576 | 高性能阈值（字节/秒，默认 1MB/s） |
| `scheduler.pluginIntervalSeconds` | number | 21600 | 插件执行间隔（秒，默认 6 小时） |
| `plugins[*].enabled` | boolean | true | 是否启用该插件 |
| `plugins[*].entry` | string | - | 插件入口文件路径 |
| `plugins[*].command` | string | node | 执行命令 |

## 📡 API 接口

### 统计信息

```api
GET /api/stats
```

返回示例：

```json
{
  "success": true,
  "data": {
    "readyCount": 100,
    "availableCount": 5000,
    "highPerfCount": 1200,
    "deletedLogsCount": 50
  }
}
```

### 节点列表

```api
GET /api/nodes/available?limit=100&offset=0
GET /api/nodes/highperf?limit=500&offset=0
```

### 订阅生成

```api
GET /api/subconverter?target=<format>&list=<type>&udp=<bool>

# 参数说明：
# target: base64 | clash | v2ray | clash-provider
# list: all | available | highperf
# udp: true | false (仅 v2ray 有效)
```

示例：

```bash
# 获取全部节点的 Clash 配置
curl http://localhost:8080/api/subconverter?target=clash&list=all

# 获取高性能节点的 Base64 订阅
curl http://localhost:8080/api/subconverter?target=base64&list=highperf

# 获取 V2Ray 订阅并启用 UDP
curl http://localhost:8080/api/subconverter?target=v2ray&list=all&udp=true
```

## 🔍 Web 控制台

访问 <http://localhost:8080> 可查看：

- 实时统计（待测/可用/高性能/已删除节点数）
- 最快可用节点列表（Top 100）
- 订阅生成器（支持多格式、多列表）

订阅生成器支持：

- **Base64**: 通用订阅格式，适合大多数客户端
- **Clash**: 完整配置文件（含代理组）
- **V2Ray/VController**: Base64 JSON 格式
- **Clash Provider**: Clash 代理提供商格式

## 🎯 节点排序规则

导入新节点时，按以下三级优先级排序：

1. **协议优先级**：SOCKS5/SOCKS4 > HTTPS > HTTP（SOCKS 节点优先）
2. **国家优先级**：HK/TW/SG/JP/GB/US/DE/KR 优先
3. **信息完整度**：有城市信息（如 `US_New_York`）> 仅国家（如 `US_Unknown`）

订阅输出保持相同排序，确保最优节点前置。

## 🔧 开发

```bash
# 安装所有依赖（包括 dev）
npm install

# 开发模式（监听文件变化）
npm run dev

# 代码检查
npm run lint

# 运行测试
npm test

# 构建 Docker 镜像
make build

# 清理数据并重启
make clean && make run
```

## 📝 插件开发

插件需输出 JSON 格式到标准输出或临时文件。推荐使用临时文件模式：

```javascript
// 插件必须输出临时文件路径到 stdout
const result = [
  {
    protocol: 'http', // 或 https, socks4, socks5
    ip: '1.2.3.4',
    port: 8080,
    shortName: 'US_United_States', // 格式：国家代码_国家名（不含空格）
    longName: 'US United States',  // 全称
    remark: 'plugin-name'
  }
];

const tmp = require('os').tmpdir();
const path = `${tmp}/plugin-${Date.now()}.json`;
require('fs').writeFileSync(path, JSON.stringify(result));
console.log(path); // 必须输出路径到 stdout
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License. 详见 [LICENSE](LICENSE) 文件。

## ⚠️ 免责声明

本项目仅供学习和研究使用。使用者需自行遵守当地法律法规，严禁用于非法用途。开发者不对使用本工具产生的任何后果承担责任。
