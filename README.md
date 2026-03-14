# Free Proxy List

高性能代理节点验证与聚合系统，专为在 **1024MB RAM** 内存受限环境下运行而深度优化。

## ✨ 特性

- **内存压榨级优化**：全链路 ESM 内存化加载，彻底抛弃子进程与临时文件交互。
- **高性能调度**：单线程事件循环驱动的异步采集与验证，极速响应。
- **双区域验证**：Global、China 双重验证策略，自动识别出口质量。
- **单产物打包**：使用 `esbuild` 将全量逻辑（含插件）整合入单一 `bundle.cjs`。

## 🚀 部署指南

### 本地运行
```bash
npm install
npm run build
npm start
```

### Docker 部署
```bash
# 推荐使用 1024MB 内存限制运行
docker build -t free-proxy-list .
docker run -d -p 8080:8080 --memory="1024m" free-proxy-list
```

## ⚙️ 核心架构

本项目采用 **Plugin-in-Memory** 架构：
1. `src/plugins.js` 静态导入并聚合所有插件。
2. `src/scheduler.js` 直接在内存中调用插件 `fetch()` 函数。
3. `src/validator.js` 执行高并发验证并根据 1024MB 限制动态控制背压。
4. `src/db.js` 使用 SQLite WAL 模式并将 Cache 严格限制在 16MB 以内。

## 🔌 插件开发说明

所有插件存放在 `plugins/` 目录，需满足以下接口：

```javascript
import axios from 'axios';

export default async function fetch() {
  const proxies = [];
  // 采集逻辑...
  proxies.push({
    protocol: 'http',
    ip: '1.2.3.4',
    port: 8080,
    shortName: 'US_NY',
    longName: 'United States New York'
  });
  return proxies;
}
```

## 🌐 API 接口

- `GET /api/stats`: 获取统计信息
- `GET /api/subconverter?target=clash`: 获取 Clash 订阅
- `GET /api/subconverter?target=base64`: 获取 Shadowrocket 订阅

更多参数请参考 `src/server.js` 路由实现。
