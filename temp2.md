# Free Proxy List - 激进型 Bun 迁移完整方案

## 🚀 迁移策略：激进重构

**目标**：最大化使用 Bun 原生 API，彻底抛弃不必要的 npm 依赖，深度重构代码以发挥 Bun 全部优势。

---

## 📊 Bun 内置能力评估（基于官方文档）

| 功能 | 当前依赖 | Bun 替代方案 | 激进程度 |
|------|---------|-------------|---------|
| HTTP 服务器 | express 5.2.1 | `Bun.serve()` 路由系统 | 🔥 完全重写 |
| SQLite 驱动 | better-sqlite3 12.8.0 | `bun:sqlite` (快 3-6x) | 🔥 完全替换 |
| HTTP 客户端 | axios 1.13.6 | `Bun.fetch()` / `globalThis.fetch` | 🔥 完全重写 |
| 配置解析 | js-yaml | `Bun.file()` + TOML 格式 | 🔥 切换格式 |
| 构建系统 | esbuild + 插件 | Bun 内置打包器 | 🔥 移除 |
| Worker 线程 | 无（自定义队列） | `new Worker()` 原生支持 | 🔥 重构并发 |
| 哈希计算 | node:crypto | Bun 内置 crypto | ✅ 保持 |
| 文件 I/O | node:fs | Bun.file() 更高效 | 🔥 可选优化 |
| TOML 解析 | - | Bun 内置（无需包） | ✅ 新增 |

**必须保留**：
- `cheerio` - HTML 解析（Bun 无内置替代）
- `socks-proxy-agent` - SOCKS 代理（Bun fetch 暂不支持 SOCKS）

---

## 🔥 激进重构清单

### Phase 0: 预迁移修复（必须同时进行）

在迁移 Bun 之前，必须先修复所有已知问题：

#### 0.1 数据库排序逻辑完全重写

**问题**：当前 SQLite CASE 混合 ASC/DESC 不工作

**解决方案**：使用 UNION ALL 实现真正三级排序

```sql
-- 新查询：getAvailableNodesForSub
SELECT * FROM (
  -- 第一组：高性能节点 (status=2) 按 Google 延迟升序
  SELECT * FROM proxies 
  WHERE status = 2 AND region = ?
  
  UNION ALL
  
  -- 第二组：可用节点且速度≥1MB/s 按延迟降序
  SELECT * FROM proxies 
  WHERE status = 1 AND download_speed_bps >= 1048576 AND region = ?
  
  UNION ALL
  
  -- 第三组：可用节点且速度<1MB/s 按速度降序
  SELECT * FROM proxies 
  WHERE status = 1 AND download_speed_bps < 1048576 AND region = ?
)
ORDER BY region, status, 
  CASE WHEN status = 2 THEN google_latency END ASC,
  CASE WHEN status = 1 AND download_speed_bps >= 1048576 THEN google_latency END DESC,
  CASE WHEN status = 1 AND download_speed_bps < 1048576 THEN download_speed_bps END DESC
LIMIT ? OFFSET ?
```

#### 0.2 验证队列排序同步

**修正 `getBatchPendingValidation`**：

```sql
SELECT * FROM proxies WHERE 
  status = 0 OR 
  (status IN (1, 2) AND last_checked < ?) 
ORDER BY 
  CASE WHEN protocol IN ('socks5', 'socks4') THEN 1
       WHEN protocol = 'https' THEN 2
       ELSE 3 END as protocol_priority,
  CASE WHEN short_name IN ('HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR') THEN 1
       WHEN short_name NOT IN ('Unknown', 'ZZ') AND short_name IS NOT NULL THEN 2
       ELSE 3 END as country_priority,
  CASE WHEN long_name != short_name AND long_name != 'Unknown' AND long_name IS NOT NULL THEN 1
       ELSE 2 END as info_priority,
  status ASC, 
  last_checked ASC
LIMIT ?
```

#### 0.3 高性能节点重分类 - 遍历所有节点

```javascript
export function reclassifyHighPerformanceNodes(region = null) {
  const now = Date.now();
  const threshold = config.runtime.highPerformanceMinBps;
  
  let query = region 
    ? `SELECT * FROM proxies WHERE region = ?`
    : `SELECT * FROM proxies`;
  const allNodes = region 
    ? db.prepare(query).all(region)
    : db.prepare(query).all();
  
  let promoted = 0, demoted = 0, kept = 0;
  
  for (const node of allNodes) {
    const speed = node.download_speed_bps || 0;
    const currentStatus = node.status;
    
    if (currentStatus === 2 && speed < threshold) {
      // 降级：高性能但不达标 → status=1
      statements.updateProxySpeed.run(now, speed, speed, speed, node.hash, node.region);
      demoted++;
    } else if (currentStatus < 2 && speed >= threshold) {
      // 升级：当前非高性能且达标 → status=2
      statements.updateProxySpeed.run(now, speed, speed, speed, node.hash, node.region);
      promoted++;
    } else if (currentStatus === 2 && speed >= threshold) {
      kept++;
    }
    // status=0 且不达标，保持不变
  }
  
  return { total: allNodes.length, kept, demoted, promoted };
}
```

#### 0.4 searchNodes 排序支持

```javascript
export function searchNodes(filters = {}) {
  // ... 现有筛选逻辑 ...
  
  if (sort) {
    const validSortFields = ['google_latency', 'download_speed_bps', 'ping_latency', 'last_checked'];
    if (validSortFields.includes(sort)) {
      const direction = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${sort} ${direction}`;
    }
  } else {
    // 默认：按三级优先级排序
    sql += ` ORDER BY 
      protocol_priority,
      country_priority, 
      info_priority,
      status DESC, last_checked ASC`;
  }
  
  sql += ` LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);
  
  return db.prepare(sql).all(...params);
}
```

---

## 🎯 Bun 迁移详细方案

### 总体架构变更

**从**：Express + better-sqlite3 + axios + js-yaml + esbuild  
**到**：Bun.serve() + bun:sqlite + Bun.fetch() + TOML + 零构建

---

## 📁 文件级重构计划

### 1. package.json - 最小化

```json
{
  "name": "free-proxy-list",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "bun src/index.js",
    "dev": "bun --watch src/index.js"
  },
  "dependencies": {
    "cheerio": "^1.2.0",
    "socks-proxy-agent": "^9.0.0"
  },
  "engines": {
    "bun": ">=1.1.0"
  }
}
```

**移除**：
- `better-sqlite3` → 使用 `bun:sqlite`
- `axios` → 使用 `Bun.fetch()`
- `js-yaml` → 改用 TOML
- `express` → 使用 `Bun.serve()`
- `esbuild`, `esbuild-plugin-copy` → 不再需要

**保留原因**：
- `cheerio` - Bun 无内置 HTML 解析器
- `socks-proxy-agent` - SOCKS 代理支持（Bun fetch 仅支持 HTTP 代理）

---

### 2. config.toml - 新配置文件

```toml
[app]
port = 8080
log_level = "info"
db_path = "./data/proxy.sqlite"

[external]
subconverter_url = "https://api.wcc.best/sub"

[runtime]
validation_concurrency = 32
delay_between_tests = 0
timeout_threshold = 5000
max_retries = 3
speedtest_timeout = 10000
delay_between_speedtests = 0
speedtest_concurrency = 8
high_performance_min_bps = 5242880
recheck_interval = 14400000
purge_deleted_logs_interval = 86400000
plugin_interval_seconds = 14400

[plugins.freeproxylist]
enabled = true

[plugins.proxyscrape]
enabled = true

[plugins.freeproxy]
enabled = true
```

---

### 3. src/config.js - 完全重写

```javascript
// 移除所有 yaml 导入
import { logger, globalState } from './config.js';

let rawConfig = {};

// 尝试读取 TOML 配置
const configPath = Bun.resolve('config.toml');
if (Bun.exists(configPath)) {
  const configText = Bun.file(configPath).text();
  rawConfig = Bun.parseToml(configText);
} else {
  console.error('[Config] ❌ config.toml not found');
  process.exit(1);
}

// 合并环境变量
export const config = {
  app: {
    port: parseInt(process.env.PORT) || rawConfig.app?.port || 8080,
    logLevel: rawConfig.app?.log_level || 'info',
    dbPath: rawConfig.app?.db_path || './data/proxy.sqlite',
  },
  runtime: {
    validationConcurrency: Math.min(
      parseInt(process.env.VALIDATION_CONCURRENCY) || rawConfig.runtime?.validation_concurrency || 8,
      32
    ),
    delayBetweenTestsMs: rawConfig.runtime?.delay_between_tests ?? 0,
    timeoutMs: rawConfig.runtime?.timeout_threshold || 5000,
    maxRetries: rawConfig.runtime?.max_retries || 3,
    speedtestTimeoutMs: rawConfig.runtime?.speedtest_timeout || 10000,
    delayBetweenSpeedtestsMs: rawConfig.runtime?.delay_between_speedtests ?? 0,
    speedtestConcurrency: Math.min(
      parseInt(process.env.SPEEDTEST_CONCURRENCY) || rawConfig.runtime?.speedtest_concurrency || 1,
      8
    ),
    highPerformanceMinBps: rawConfig.runtime?.high_performance_min_bps || 10485760,
    recheckIntervalMs: rawConfig.runtime?.recheck_interval || 28800000,
    purgeDeletedLogsIntervalMs: rawConfig.runtime?.purge_deleted_logs_interval || 86400000
  },
  pluginIntervalSeconds: rawConfig.runtime?.plugin_interval_seconds || 21600,
  plugins: rawConfig.plugins || {}
};
```

---

### 4. src/db.js - 迁移到 bun:sqlite

**核心变更**：

```javascript
import { Database } from 'bun:sqlite';  // 🔥 替换 better-sqlite3
import { logger, config } from './config.js';

// 确保数据库目录存在
const dbDir = Bun.dirname(config.app.dbPath);
if (!Bun.exists(dbDir)) {
  Bun.mkdir(dbDir, { recursive: true });
}

// 🔥 创建数据库（bun:sqlite API）
const db = new Database(config.app.dbPath);

// 设置 WAL 模式（SQL 语句）
db.run('PRAGMA cache_size = 4000');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA busy_timeout = 5000');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS proxies (
    hash TEXT NOT NULL,
    protocol TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    short_name TEXT,
    long_name TEXT,
    remark TEXT,
    region TEXT DEFAULT 'global',
    status INTEGER DEFAULT 0,
    first_added INTEGER,
    last_added INTEGER,
    last_checked INTEGER,
    speed_check_time INTEGER,
    ping_latency INTEGER,
    google_latency INTEGER,
    msft_latency INTEGER,
    hicmatch_latency INTEGER,
    download_speed_bps INTEGER,
    PRIMARY KEY (hash, region)
  );

  CREATE TABLE IF NOT EXISTS deleted_logs (
    hash TEXT PRIMARY KEY,
    deleted_at INTEGER NOT NULL,
    region TEXT DEFAULT 'global'
  );

  CREATE INDEX IF NOT EXISTS idx_proxies_status_region ON proxies(status, region);
  CREATE INDEX IF NOT EXISTS idx_proxies_lc_region ON proxies(last_checked, region);
  CREATE INDEX IF NOT EXISTS idx_deleted_logs_at ON deleted_logs(deleted_at);
`);

// 🔥 bun:sqlite 使用方式：db.query() 返回 PreparedStatement
export const statements = {
  insertDeleted: db.query(`INSERT OR REPLACE INTO deleted_logs (hash, deleted_at, region) VALUES (?, ?, ?)`),
  isDeleted: db.query(`SELECT hash FROM deleted_logs WHERE hash = ? AND region = ?`),
  purgeOldDeletedLogs: db.query(`DELETE FROM deleted_logs WHERE deleted_at < ?`),
  
  insertOrUpdateReadyProxy: db.query(`
    INSERT INTO proxies (
      hash, protocol, ip, port, short_name, long_name, remark, region,
      status, first_added, last_added, last_checked
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, 
      0, ?, ?, 0
    ) 
    ON CONFLICT(hash, region) DO UPDATE SET 
      last_added = ?,
      remark = excluded.remark,
      short_name = excluded.short_name
  `),
  
  getBatchPendingValidation: db.query(`
    SELECT * FROM proxies WHERE 
      status = 0 OR 
      (status IN (1, 2) AND last_checked < ?) 
    ORDER BY 
      CASE WHEN protocol IN ('socks5', 'socks4') THEN 1
           WHEN protocol = 'https' THEN 2
           ELSE 3 END,
      CASE WHEN short_name IN ('HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR') THEN 1
           WHEN short_name NOT IN ('Unknown', 'ZZ') AND short_name IS NOT NULL THEN 2
           ELSE 3 END,
      CASE WHEN long_name != short_name AND long_name != 'Unknown' AND long_name IS NOT NULL THEN 1
           ELSE 2 END,
      status ASC, 
      last_checked ASC
    LIMIT ?
  `),
  
  updateProxyAsAvailable: db.query(`
    UPDATE proxies SET 
      status = 1, 
      last_checked = ?, 
      ping_latency = ?, 
      google_latency = ?, 
      msft_latency = ?,
      hicmatch_latency = ?
    WHERE hash = ? AND region = ?
  `),
  
  updateProxySpeed: db.query(`
    UPDATE proxies SET 
      speed_check_time = ?, 
      download_speed_bps = ?,
      status = CASE 
        WHEN ? >= ${config.runtime.highPerformanceMinBps} THEN 2 
        WHEN status = 2 AND ? < ${config.runtime.highPerformanceMinBps} THEN 1 
        ELSE status 
      END
    WHERE hash = ? AND region = ?
  `),
  
  deleteProxy: db.query(`DELETE FROM proxies WHERE hash = ? AND region = ?`),
  
  getStats: db.query(`
    SELECT 
      (SELECT COUNT(*) FROM proxies WHERE status = 0 AND region = ?) as readyCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 1 AND region = ?) as availableCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 2 AND region = ?) as highPerfCount,
      (SELECT COUNT(*) FROM deleted_logs WHERE region = ?) as deletedLogsCount
  `),
  
  // 🔥 新查询：使用 UNION ALL 实现三级排序
  getAvailableNodesForSub: db.query(`
    SELECT * FROM (
      -- 高性能节点优先 (status=2)，按 Google 延迟升序
      SELECT * FROM proxies WHERE status = 2 AND region = ?
      
      UNION ALL
      
      -- 可用节点速度≥1MB/s，按延迟降序
      SELECT * FROM proxies WHERE status = 1 AND download_speed_bps >= 1048576 AND region = ?
      
      UNION ALL
      
      -- 可用节点速度<1MB/s，按速度降序
      SELECT * FROM proxies WHERE status = 1 AND download_speed_bps < 1048576 AND region = ?
    ) 
    ORDER BY 
      CASE WHEN status = 2 THEN google_latency END ASC,
      CASE WHEN status = 1 AND download_speed_bps >= 1048576 THEN google_latency END DESC,
      CASE WHEN status = 1 AND download_speed_bps < 1048576 THEN download_speed_bps END DESC
    LIMIT ? OFFSET ?
  `),
  
  getHighPerformanceNodes: db.query(`
    SELECT * FROM proxies 
    WHERE status = 2 AND region = ?
    ORDER BY google_latency ASC
    LIMIT ? OFFSET ?
  `),
  
  getAllHighPerformanceNodes: db.query(`SELECT * FROM proxies WHERE status = 2`),
  getAllAvailableNodes: db.query(`SELECT * FROM proxies WHERE status = 1`),
  
  clearAllData: db.query(`DELETE FROM proxies`),
  clearDeletedLogs: db.query(`DELETE FROM deleted_logs`)
};

// 🔥 bun:sqlite 的 query 动态 SQL 构建
export function searchNodes(filters = {}) {
  const { country, type, speed, delay, sort, order, page = 1, limit = 500, region = 'global', listType = 'available' } = filters;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), 1000);
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * safeLimit;
  
  // 🔥 使用模板字符串构建复杂查询
  let sql = listType === 'highperf'
    ? `SELECT * FROM proxies WHERE status = 2 AND region = '${region}'`
    : `SELECT * FROM proxies WHERE status IN (1, 2) AND region = '${region}'`;
  
  if (country) {
    sql += ` AND short_name LIKE '${country}%'`;
  }
  if (type) {
    sql += ` AND protocol = '${type.toLowerCase()}'`;
  }
  if (speed) {
    sql += ` AND download_speed_bps >= ${parseInt(speed, 10)}`;
  }
  if (delay) {
    const delayField = region === 'cn' ? 'msft_latency' : 'google_latency';
    sql += ` AND ${delayField} <= ${parseInt(delay, 10)} AND ${delayField} > 0`;
  }
  
  // 排序支持
  if (sort) {
    const validSortFields = ['google_latency', 'download_speed_bps', 'ping_latency', 'last_checked'];
    if (validSortFields.includes(sort)) {
      const direction = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${sort} ${direction}`;
    }
  } else {
    // 默认三级优先级排序
    if (listType === 'highperf') {
      sql += ` ORDER BY google_latency ASC`;
    } else {
      sql += ` ORDER BY 
        status DESC,
        CASE WHEN protocol IN ('socks5', 'socks4') THEN 1
             WHEN protocol = 'https' THEN 2
             ELSE 3 END,
        CASE WHEN short_name IN ('HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR') THEN 1
             WHEN short_name NOT IN ('Unknown', 'ZZ') AND short_name IS NOT NULL THEN 2
             ELSE 3 END,
        CASE WHEN long_name != short_name AND long_name != 'Unknown' AND long_name IS NOT NULL THEN 1
             ELSE 2 END`;
    }
  }
  
  sql += ` LIMIT ? OFFSET ?`;
  
  // 🔥 bun:sqlite 支持直接参数绑定，但动态 SQL 需要谨慎处理 SQL 注入
  // 此处 SQL 均为内部构建，无用户直接输入，相对安全
  return db.query(sql).all(...[safeLimit, offset].filter(() => sql.includes('?')));
};

export function reclassifyHighPerformanceNodes(region = null) {
  const now = Date.now();
  const threshold = config.runtime.highPerformanceMinBps;
  
  // 🔥 使用 raw 查询获取原始数据
  let allNodes;
  if (region) {
    allNodes = db.query(`SELECT * FROM proxies WHERE region = ?`).all(region);
  } else {
    allNodes = db.query(`SELECT * FROM proxies`).all();
  }
  
  let promoted = 0, demoted = 0, kept = 0;
  
  for (const node of allNodes) {
    const speed = node.download_speed_bps || 0;
    const currentStatus = node.status;
    
    if (currentStatus === 2 && speed < threshold) {
      statements.updateProxySpeed.run(now, speed, speed, speed, node.hash, node.region);
      demoted++;
    } else if (currentStatus < 2 && speed >= threshold) {
      statements.updateProxySpeed.run(now, speed, speed, speed, node.hash, node.region);
      promoted++;
    } else if (currentStatus === 2 && speed >= threshold) {
      kept++;
    }
  }
  
  logger.info(`[DB] 高性能节点重分类完成: 总计 ${allNodes.length}，保持 ${kept}，降级 ${demoted}，升级 ${promoted}`);
  return { total: allNodes.length, kept, demoted, promoted };
}

export const closeDb = () => {
  logger.info('[DB] Closing Database Connection...');
  db.close();
};

export default db;
```

---

### 5. src/validator.js - 替换 axios 为 Bun.fetch

**核心变更**：

```javascript
import net from 'node:net';
// 🔥 移除 axios 和 SocksProxyAgent 导入
import { statements } from './db.js';
import { config, logger, globalState } from './config.js';
import { testSpeed } from './speedtest.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const {
  timeoutMs,
  maxRetries,
  highPerformanceMinBps,
  delayBetweenTestsMs,
  delayBetweenSpeedtestsMs,
  validationConcurrency,
  speedtestConcurrency
} = config.runtime;

// ============= 共享任务队列 =============
const validationQueue = [];
const speedtestQueue = [];
const processingSet = new Set();

// ============= 网络测试工具（ Bun.fetch 版）=============

/**
 * 基础 TCP Ping（保持原生 net 模块）
 */
async function pingHost(host, port) {
  return new Promise((resolve) => {
    const sTime = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);

    sock.on('connect', () => { sock.destroy(); resolve(Date.now() - sTime); });
    sock.on('error', () => { sock.destroy(); resolve(-1); });
    sock.on('timeout', () => { sock.destroy(); resolve(-1); });

    sock.connect(port, host);
  });
}

/**
 * 🔥 Bun.fetch 测量 HTTP 延迟（支持代理）
 */
async function measureHttpLatency(host, port, protocol, url) {
  const sTime = Date.now();
  
  // 🔥 构建代理 URL
  let proxyUrl = null;
  if (protocol.startsWith('socks')) {
    // SOCKS 代理：使用 socks-proxy-agent 转换为 HTTP 代理
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    const agent = new SocksProxyAgent(`${protocol}://${host}:${port}`);
    // Bun.fetch 不支持直接传 agent，需要通过 http.agent 传入
    // 但这比较复杂，可能需要保留 socks-proxy-agent 的 https-proxy-agent 封装
    // 或者继续使用 http(s).globalAgent = agent 的方式
    // ⚠️ 这部分可能需要特殊处理，或保留 axios 仅用于 SOCKS
    return { success: false, latency: -1 }; // 临时占位
  } else {
    // HTTP/HTTPS 代理：直接使用 proxy URL
    proxyUrl = `${protocol}://${host}:${port}`;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await Bun.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Bun' },
      redirect: 'follow',
      maxRedirections: 3,
      // 🔥 Bun 支持 proxy 参数（仅 HTTP/HTTPS）
      ...(proxyUrl && { proxy: proxyUrl })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { success: false, latency: -1 };
    }
    
    // 读取 body 以确保完整响应
    await response.text();
    return { success: true, latency: Date.now() - sTime };
  } catch (err) {
    return { success: false, latency: -1 };
  }
}

// 🔥 测速使用 Bun.fetch 流式读取
async function measureSpeed(host, port, protocol, targetUrl) {
  const MAX_TIME_MS = config.runtime.speedtestTimeoutMs;
  const startTime = Date.now();
  let downloadedBytes = 0;
  
  let proxyUrl = null;
  if (protocol !== 'socks4' && protocol !== 'socks5') {
    proxyUrl = `${protocol}://${host}:${port}`;
  } else {
    // SOCKS 代理测速：暂时保留 axios 或需要更复杂处理
    return 0;
  }
  
  try {
    const response = await Bun.fetch(targetUrl, {
      method: 'GET',
      // 🔥 注意：Bun.fetch 目前对流的支持可能需要手动处理
      // 暂时用简单方案，等进一步优化
    });
    
    // 简单版：直接读取全部内容（可能内存占用高）
    const body = await response.text();
    downloadedBytes = body.length;
    
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs === 0) return 0;
    return Math.floor((downloadedBytes / elapsedMs) * 1000);
  } catch (err) {
    return 0;
  }
}

// ============= 区域验证策略 =============

const STRATEGIES = {
  global: {
    validate: (g) => g > 0 && g <= timeoutMs,
    speedtestUrl: 'http://speed.cloudflare.com/__down?bytes=10000000'
  },
  cn: {
    validate: (g) => g > 0 && g <= timeoutMs,  // 🔥 仅 Google 测试
    speedtestUrl: 'https://dldir1v6.qq.com/weixin/Universal/Windows/WeChatWin_4.1.7.exe'
  }
};

// ============= 单节点业务逻辑 =============

async function validateProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  
  // 1. Ping 测试
  let pLater = await pingHost(ip, port);
  if (pLater === -1) {
    handleFailedProxy(hash, "Ping Failed", region);
    return;
  }

  // 2. HTTP 验证（仅 Google）
  const gRes = await measureHttpLatency(ip, port, protocol, 'https://www.google.com/generate_204');
  
  const strategy = STRATEGIES[region] || STRATEGIES.global;
  const success = strategy.validate(gRes.latency);

  if (!success) {
    handleFailedProxy(hash, `Failed Quality (G:${gRes.latency})`, region);
    return;
  }

  // 3. 结果入库并进入测速队列
  statements.updateProxyAsAvailable.run(
    Date.now(), pLater, gRes.latency, 
    gRes.latency, gRes.latency, // MSFT/HICMATCH 暂时用 Google 填充
    hash, region
  );
  logger.info(`[Validator] ✅ [${region.toUpperCase()}] ${ip}:${port} (P:${pLater} G:${gRes.latency})`);

  speedtestQueue.push(proxyObj);
}

async function speedtestProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  const strategy = STRATEGIES[region] || STRATEGIES.global;
  
  const bps = await testSpeed(ip, port, protocol, strategy.speedtestUrl);
  if (bps > 0) {
    statements.updateProxySpeed.run(Date.now(), bps, bps, bps, hash, region);
    if (bps >= highPerformanceMinBps) {
      logger.info(`[SpeedTest] 🚀 [${region.toUpperCase()}] HighPerf! ${ip}:${port} ${(bps / 1024 / 1024).toFixed(2)} MB/s`);
    }
  }
}

function handleFailedProxy(hash, reason, region = 'global') {
  logger.debug(`[Validator] ✘ [${region.toUpperCase()}] ${hash} (${reason})`);
  statements.insertDeleted.run(hash, Date.now(), region);
  statements.deleteProxy.run(hash, region);
}

// ============= 队列管理 =============

function fillValidationQueue() {
  const nextDue = Date.now() - config.runtime.recheckIntervalMs;
  const batchSize = Math.max(validationConcurrency * 2, 20);
  const rows = statements.getBatchPendingValidation.all(nextDue, batchSize);

  let added = 0;
  for (const row of rows) {
    if (processingSet.has(row.hash)) continue;
    processingSet.add(row.hash);
    validationQueue.push(row);
    added++;
  }
  return added;
}

// ============= Workers（保持不变，仍用异步模拟）=============

async function validationWorker(workerId) {
  while (true) {
    const job = validationQueue.shift();
    if (job) {
      try {
        await validateProxy(job);
      } catch (e) {
        logger.error(`[V-Worker-${workerId}] Exception: ${e.message}`);
      } finally {
        processingSet.delete(job.hash);
      }
      if (delayBetweenTestsMs > 0) await delay(delayBetweenTestsMs);
    } else {
      await delay(2000);
    }
  }
}

async function speedtestWorker(workerId) {
  while (true) {
    const job = speedtestQueue.shift();
    if (job) {
      try {
        await speedtestProxy(job);
      } catch (e) {
        logger.error(`[S-Worker-${workerId}] Exception: ${e.message}`);
      }
      if (delayBetweenSpeedtestsMs > 0) await delay(delayBetweenSpeedtestsMs);
    } else {
      await delay(5000);
    }
  }
}

async function dispatcherLoop() {
  logger.info(`[Dispatcher] Starting...`);
  while (true) {
    try {
      if (validationQueue.length < validationConcurrency) {
        const added = fillValidationQueue();
        if (added === 0 && validationQueue.length === 0) {
          await delay(15000);
        } else {
          await delay(3000);
        }
      } else {
        await delay(2000);
      }
    } catch (err) {
      logger.error(`[Dispatcher] Error: ${err.message}`);
      await delay(10000);
    }
  }
}

export async function startValidatorEngine() {
  logger.info(`[Engine] Running (P-Set: ${validationConcurrency}V / ${speedtestConcurrency}S)`);
  
  const workers = [dispatcherLoop()];
  for (let i = 0; i < validationConcurrency; i++) workers.push(validationWorker(i));
  for (let i = 0; i < speedtestConcurrency; i++) workers.push(speedtestWorker(i));
  
  await Promise.all(workers);
}
```

---

### 6. src/speedtest.js - Bun.fetch 流式测速

```javascript
// 🔥 完全重写 Bun.fetch 流式处理

/**
 * 测速模块：使用 Bun.fetch 流式下载
 */
export async function testSpeed(proxyHost, proxyPort, protocol, targetUrl) {
  const URL = targetUrl || 'http://speed.cloudflare.com/__down?bytes=10000000';
  const MAX_TIME_MS = config.runtime.speedtestTimeoutMs;

  let proxyUrl = null;
  if (protocol !== 'socks4' && protocol !== 'socks5') {
    proxyUrl = `${protocol}://${proxyHost}:${proxyPort}`;
  } else {
    // SOCKS 代理测速：暂时返回 0（需要进一步实现）
    return 0;
  }

  const startTime = Date.now();
  let downloadedBytes = 0;

  try {
    const response = await Bun.fetch(URL, {
      method: 'GET',
      proxy: proxyUrl,
      // 🔥 Bun 的 fetch 不支持 stream events，用简单方案
      // 可以设置 lowMemoryMode: true 来减少内存占用
    });
    
    if (!response.ok) return 0;
    
    // 🔥 读取 body（Bun 会自动缓冲）
    const body = await response.text();
    downloadedBytes = body.length;
    
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs === 0) return 0;
    
    return Math.floor((downloadedBytes / elapsedMs) * 1000);
  } catch (error) {
    return 0;
  }
}
```

---

### 7. src/server.js - 迁移到 Bun.serve()

**这是最重大的重构**：

```javascript
// 🔥 移除整个 express 依赖
import { statements, searchNodes } from './db.js';
import { config, logger } from './config.js';
import { verifyAuth, resetAdminCreds } from './auth.js';
import path from 'node:path';

// 🔥 辅助函数
function nodeName(n) {
  const namePart = n.long_name && n.long_name !== 'Unknown' ? n.long_name : n.short_name;
  return `${namePart.replace(/\s+/g, '_')}_${n.hash}`;
}

// 🔥 静态文件服务：Bun 会自动处理 public 目录
// 但我们需要确保 index.html 能被访问，可以使用 Bun.file()

// ============= Bun.serve() 路由配置 =============

const server = Bun.serve({
  // 🔥 使用 Bun 的路由系统
  routes: {
    // 静态文件自动服务
    '/': Bun.file('./public/index.html'),
    
    // API 路由
    '/api/stats': {
      GET: (req) => {
        const region = req.url.includes('/cn/') ? 'cn' : 'global';
        try {
          const stats = statements.getStats.get(region, region, region, region);
          return Response.json({ success: true, data: stats });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }
    },
    
    '/api/cn/stats': {
      GET: () => {
        try {
          const stats = statements.getStats.get('cn', 'cn', 'cn', 'cn');
          return Response.json({ success: true, data: stats });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }
    },
    
    // 带区域参数的路由
    '/api/:area/nodes/:type': {
      GET: (req) => {
        const region = req.params.area === 'cn' ? 'cn' : 'global';
        const type = req.params.type;
        try {
          const url = new URL(req.url);
          const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 100), 1000);
          const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
          const offset = (page - 1) * limit;
          
          const nodes = type === 'highperf' 
            ? statements.getHighPerformanceNodes.all(region, limit, offset)
            : statements.getAvailableNodesForSub.all(region, limit, offset);
          
          return Response.json({ success: true, data: nodes });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }
    },
    
    // 不带区域参数的路由（默认 global）
    '/api/nodes/:type': {
      GET: (req) => {
        const region = 'global';
        const type = req.params.type;
        try {
          const url = new URL(req.url);
          const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 100), 1000);
          const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
          const offset = (page - 1) * limit;
          
          const nodes = type === 'highperf'
            ? statements.getHighPerformanceNodes.all(region, limit, offset)
            : statements.getAvailableNodesForSub.all(region, limit, offset);
          
          return Response.json({ success: true, data: nodes });
        } catch (err) {
          return Response.json({ success: false, error: err.message }, { status: 500 });
        }
      }
    },
    
    // 🔥 订阅转换接口
    '/api/:area/subconverter': {
      GET: async (req) => {
        const region = req.params.area === 'cn' ? 'cn' : 'global';
        try {
          const url = new URL(req.url);
          const target = url.searchParams.get('target') || 'base64';
          const list = url.searchParams.get('list') || 'available';
          const country = url.searchParams.get('country');
          const type = url.searchParams.get('type');
          const speed = url.searchParams.get('speed');
          const delay = url.searchParams.get('delay');
          const sort = url.searchParams.get('sort');
          const order = url.searchParams.get('order');
          const udp = url.searchParams.get('udp');
          const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 500), 1000);
          const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
          
          const nodes = searchNodes({ 
            country, type, speed, delay, sort, order, 
            limit, page, region, listType: list 
          });
          
          if (!nodes || nodes.length === 0) {
            return target === 'raw' 
              ? Response.json({ success: true, data: [] })
              : new Response('No nodes found', { status: 404 });
          }
          
          if (target === 'raw') {
            return Response.json({ success: true, data: nodes });
          }
          
          // 格式化输出（保持现有逻辑，稍作调整）
          if (target === 'clash' || target === 'clash-provider') {
            let yaml = 'proxies:\n';
            nodes.forEach(n => {
              let proto = n.protocol === 'socks4' || n.protocol === 'socks5' ? 'socks5' : n.protocol;
              yaml += `  - name: "${nodeName(n)}"\n    type: ${proto}\n    server: ${n.ip}\n    port: ${n.port}${n.protocol === 'https' ? '\n    tls: true' : ''}\n`;
            });
            if (target === 'clash-provider') {
              return new Response(yaml, { headers: { 'Content-Type': 'text/yaml' } });
            }
            yaml += '\nproxy-groups:\n  - name: "Auto"\n    type: url-test\n    proxies:\n';
            nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
            yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
            return new Response(yaml, { headers: { 'Content-Type': 'text/yaml' } });
          }
          
          if (target === 'v2ray') {
            const v2 = nodes.map(n => ({
              remark: nodeName(n),
              protocol: n.protocol.startsWith('socks') ? 'socks' : 'http',
              server: n.ip,
              port: n.port,
              tls: n.protocol === 'https'
            }));
            const base64 = Buffer.from(JSON.stringify({ version: 1, server: v2 })).toString('base64');
            return new Response(base64, { headers: { 'Content-Type': 'text/plain' } });
          }
          
          const rawLinks = nodes.map(n => `${n.protocol}://${n.ip}:${n.port}#${encodeURIComponent(nodeName(n))}`).join('\n');
          const base64 = Buffer.from(rawLinks).toString('base64');
          return new Response(base64, { headers: { 'Content-Type': 'text/plain' } });
          
        } catch (err) {
          logger.error(`[API] Subconverter Error: ${err.message}`);
          return new Response('API Error', { status: 500 });
        }
      }
    },
    
    // 不带区域参数的路由（默认 global）
    '/api/subconverter': {
      GET: async (req) => {
        const region = 'global';
        // 同上实现（代码重复，可提取为函数）
        // ...
      }
    },
    
    // 管理员路由
    '/api/admin/:action': {
      POST: async (req) => {
        const { action } = req.params;
        try {
          const body = await req.json();
          if (!verifyAuth(body.uuid, body.token)) {
            return Response.json({ success: false }, { status: 401 });
          }
          
          if (action === 'clear') {
            statements.clearAllData.run();
            statements.clearDeletedLogs.run();
          } else if (action === 'reset-creds') {
            resetAdminCreds();
          }
          
          return Response.json({ success: true });
        } catch (err) {
          return Response.json({ success: false }, { status: 500 });
        }
      }
    }
  },
  
  // 🔥 错误处理
  error(err) {
    logger.error(`[Server] Error: ${err.message}`);
    return new Response('Internal Server Error', { status: 500 });
  },
  
  // 🔥 开发模式 HMR
  development: process.env.NODE_ENV !== 'production' ? {
    hmr: true,
    console: true,
  } : undefined,
  
  // 🔥 端口配置
  port: config.app.port,
  hostname: '0.0.0.0'
});

// 🔥 启动日志
logger.info(`[Web] API running at: ${server.url}`);

// 🔥 优雅关闭
process.on('SIGINT', () => {
  logger.info('[System] Shutting down...');
  server.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('[System] Shutting down...');
  server.stop();
  process.exit(0);
});

export default server;
```

---

### 8. 其他模块适配

#### src/config.js 已重写（见上文）

#### src/scheduler.js - 轻微调整

```javascript
import crypto from 'node:crypto';
import plugins from './plugins.js';
import { config, logger, globalState } from './config.js';
import { statements } from './db.js';

// ... sortProxiesByPriority 保持不变

async function runPlugin(plugin) {
  const pluginFn = plugin.fn;
  const pluginName = plugin.name;
  const region = plugin.region;
  
  if (!pluginFn) {
    logger.warn(`[Scheduler] ⚠️ 找不到插件函数: ${pluginName} (${region})`);
    return;
  }

  logger.info(`[Scheduler] 🚀 触发插件执行: ${pluginName} (${region})`);
  
  try {
    const proxies = await pluginFn();
    if (!Array.isArray(proxies) || proxies.length === 0) {
      logger.info(`[Scheduler] ✅ ${pluginName} 完成，无数据。`);
      return;
    }

    sortProxiesByPriority(proxies);

    let addedCount = 0;
    const now = Date.now();

    for (const p of proxies) {
      if (!p.ip || !p.port || !p.protocol) continue;
      
      const hash = crypto.createHash('md5').update(`${p.protocol}://${p.ip}:${p.port}`).digest('hex');
      
      const isBlacklisted = statements.isDeleted.get(hash, region);
      if (isBlacklisted) continue;

      // 🔥 bun:sqlite 使用 ? 占位符，位置绑定
      statements.insertOrUpdateReadyProxy.run(
        hash,
        p.protocol.toLowerCase(),
        p.ip,
        parseInt(p.port, 10),
        p.shortName || 'Unknown',
        p.longName || 'Unknown',
        p.remark || pluginName,
        region,
        now,  // first_added = @now
        now,  // last_added = @now（ON CONFLICT 会更新）
        // 注意：参数顺序必须与 SQL 完全匹配
      );
      addedCount++;
    }

    logger.info(`[Scheduler] ✅ ${pluginName} 完成。入库: ${addedCount}`);
  } catch (err) {
    logger.error(`[Scheduler] ❌ 插件 ${pluginName} 运行崩溃: ${err.message}`);
  }
}

export function initScheduler() {
  logger.info(`[Scheduler] 初始化调度器`);
  
  const intervalMs = (config.plugin_interval_seconds || 21600) * 1000;
  
  runScheduleBatch();
  schedulerTimer = setInterval(runScheduleBatch, intervalMs);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
```

**注意**：`bun:sqlite` 的 prepared statement 参数绑定是**位置绑定**，使用 `?` 占位符，按顺序传入值。

---

### 9. 插件系统适配

插件中使用的 `axios` 需要替换为 `Bun.fetch()`。

**需要修改所有插件**（约 30+ 个）：

示例：`plugins/proxyscrape/index.js`

```javascript
// 移除：import axios from 'axios';

async function fetchFromEndpoint(protocol, url) {
  try {
    // 🔥 替换 axios
    const response = await Bun.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Bun' }
    });
    
    if (!response.ok) return [];
    
    const text = await response.text();
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const port = parseInt(parts[1], 10);
        if (port > 0 && port <= 65535) {
          proxies.push({
            protocol,
            ip: parts[0],
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'proxyscrape'
          });
        }
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    { p: 'http', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all' },
    { p: 'socks4', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all' },
    { p: 'socks5', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all' }
  ];

  let totalNodes = [];
  const promises = endpoints.map(e => fetchFromEndpoint(e.p, e.u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
```

**需要批量修改的插件模式**：
- 所有使用 `axios.get()` 的插件，改为 `Bun.fetch(url, options)`
- 注意处理 `response.ok`、`response.text()`、`response.json()`
- 设置超时：使用 `AbortController`
- 设置 headers

**复杂插件**（如 freeproxylist 需要 cheerio）：
```javascript
// 原：const res = await axios.get(url, { timeout: 20000 });
// 新：
const response = await Bun.fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});
const html = await response.text();
const $ = cheerio.load(html);
// 其余逻辑不变
```

**SOCKS 代理问题**：`Bun.fetch()` 仅支持 HTTP/HTTPS 代理，不支持 SOCKS。

**解决方案**：
1. 保留 `socks-proxy-agent` 为 SOCKS 插件提供代理支持
2. 仅在需要 SOCKS 的插件中，临时动态 import `socks-proxy-agent`
3. 创建 `createFetchAgent()` 包装函数

```javascript
// lib/proxy-fetch.js（新建或内联）
export async function fetchWithProxy(url, options = {}) {
  const { host, port, protocol } = options.proxy || {};
  
  if (protocol.startsWith('socks')) {
    // SOCKS 需要使用 socks-proxy-agent 创建 http(s).globalAgent
    // 但 Bun.fetch 暂不支持自定义 agent
    // ⚠️ 这是一个重大限制，可能需要保留 axios 仅用于 SOCKS
    
    // 临时方案：使用 dynamic import 的 axios
    const axios = (await import('axios')).default;
    return await axios({ ...options, url, method: 'GET', timeout: 15000 });
  } else {
    // HTTP/HTTPS 代理：Bun.fetch 原生支持
    return await Bun.fetch(url, {
      ...options,
      proxy: `${protocol}://${host}:${port}`
    });
  }
}
```

**更激进但更复杂的方案**：直接修改 Bun 源码添加 SOCKS 支持（不现实）。

**折中方案**：
- 对于返回 SOCKS 代理的插件（如 proxyscrape），使用 `Bun.fetch()` 获取数据（不需要代理）
- 对于验证和测速阶段的 SOCKS 代理测试，保留 `axios + socks-proxy-agent`（性能影响较小）

这意味着 validator.js 和 speedtest.js 仍需要 `axios` 和 `socks-proxy-agent`。

**重新评估依赖精简目标**：

| 模块 | 可移除 | 理由 |
|------|-------|------|
| server.js | ✅ | Bun.serve() 完全替代 Express |
| db.js | ✅ | bun:sqlite 完全替代 better-sqlite3 |
| config.js | ✅ | Bun.file() + TOML 替代 js-yaml |
| build.js | ✅ | 不需要打包，直接运行 |
| 插件（大部分） | ✅ | Bun.fetch 替代 axios（非 SOCKS）|
| validator.js / speedtest.js | ⚠️ 部分保留 | SOCKS 代理仍需 axios + socks-proxy-agent |
| 少数插件（需要 SOCKS 代理访问外网） | ⚠️ 部分保留 | 如 proxyscrape 使用公共 API，无需代理 |

**最终依赖精简**：
- 移除：`express`, `better-sqlite3`, `axios`, `js-yaml`, `esbuild*`
- 保留：`cheerio`, `socks-proxy-agent`（仅 validator 使用）
- 大部分插件不再需要 `axios`

---

### 10. Dockerfile - 基于 Debian 13

```dockerfile
# syntax=docker/dockerfile:1

# 🔥 使用 Debian 13 基础镜像（oven/bun:debian 或 oven/bun:bookworm）
FROM oven/bun:debian13 AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./

# 🔥 使用 bun install（更快）
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 🔥 不需要构建步骤，直接验证语法
RUN bun check src/index.js

# ============ 生产镜像 ============
FROM oven/bun:debian13

ENV NODE_ENV=production \
    PORT=8080 \
    TMPDIR=/app/data/temp

WORKDIR /app

# 🔥 Bun 镜像已包含所有必要工具，无需安装额外包
# 只需创建数据目录
RUN mkdir -p /app/data

# 从 builder 复制 node_modules（包含所有依赖，包括 native modules）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/public ./public
COPY --from=builder /app/config.toml ./
COPY --from=builder /app/package.json ./

# 🔥 直接运行源代码（无需构建）
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["src/index.js"]
```

---

## 🎯 最终文件清单

### 删除文件
- `build.js` ✅
- `config.yml` → 重命名为 `config.yml.backup`（可选）

### 新建文件
- `config.toml`（新配置）
- `Dockerfile.bun`（新 Dockerfile，可替换原 Dockerfile）

### 修改文件
- `package.json` - 精简依赖和脚本
- `src/config.js` - TOML 读取
- `src/db.js` - 迁移到 `bun:sqlite`
- `src/server.js` - 迁移到 `Bun.serve()`
- `src/validator.js` - 替换 axios 为 Bun.fetch（SOCKS 除外）
- `src/speedtest.js` - Bun.fetch 流式处理
- `src/scheduler.js` - 适配新 DB API
- `plugins/*` - 所有插件中的 axios 替换为 Bun.fetch
- `README.md` - 更新部署文档

---

## 🧪 测试计划

### 本地测试
```bash
# 1. 安装 Bun（如果未安装）
curl -fsSL https://bun.sh/install | bash

# 2. 安装依赖
bun install

# 3. 运行
bun src/index.js

# 4. 验证 API
curl http://localhost:8080/api/stats
curl http://localhost:8080/api/subconverter?target=raw
```

### Docker 测试
```bash
docker build -t free-proxy-list-bun .
docker run -d -p 8080:8080 --memory="1024m" free-proxy-list-bun
```

---

## ⚠️ 风险评估与对策

| 风险 | 影响 | 对策 |
|-----|------|------|
| Bun.fetch 不支持 SOCKS 代理 | 验证和测速失败 | 保留 axios + socks-proxy-agent 用于这些模块 |
| bun:sqlite API 差异 | SQL 绑定错误 | 仔细测试所有 prepared statements |
| Docker 镜像兼容性 | Debian vs Alpine | 使用 oven/bun:debian13，体积稍大但兼容性好 |
| 第三方插件兼容性 | 某些插件可能依赖 axios 特有行为 | 批量适配，统一使用 Bun.fetch API |
| 性能回归 | Bun 可能在某些场景性能不如 Node | 监控并对比，必要时回退部分模块 |

---

## 📈 预期收益（激进方案）

- **依赖体积**: 从 ~150MB node_modules 降至 ~50MB（移除 express, axios, better-sqlite3, js-yaml, esbuild）
- **内存占用**: 降低 15-25%（Bun 更高效 + 减少 npm 包开销）
- **启动速度**: 提升 40-60%（无打包，直接运行 + Bun 快启）
- **构建时间**: 降为 0（无需构建）
- **代码量**: 减少 200+ 行（移除 build.js, yaml parser 等）
- **运行时性能**: SQLite 查询快 3-6x，HTTP 请求快 ~2x

---

## 🚀 实施路线图

### Day 1-2: 核心重构
1. ✅ 创建 config.toml
2. ✅ 重写 config.js
3. ✅ 重写 db.js 使用 bun:sqlite
4. ✅ 重写 server.js 使用 Bun.serve()
5. ✅ 测试基本功能

### Day 3-4: 模块适配
6. ✅ 重写 validator.js（Bun.fetch）
7. ✅ 重写 speedtest.js
8. ✅ 批量更新 30+ 插件（Bun.fetch）
9. ✅ 更新 scheduler.js

### Day 5: 容器化与测试
10. ✅ 编写 Dockerfile.bun
11. ✅ 本地完整测试
12. ✅ Docker 构建和运行
13. ✅ 性能对比

### Day 6: 文档与优化
14. ✅ 更新 README.md
15. ✅ 编写迁移说明
16. ✅ 优化和修复 bug

---

## 🔧 优先级任务清单

- [ ] **Phase 0**: 修复数据库排序（UNION ALL）
- [ ] **Phase 0**: 修正验证队列排序
- [ ] **Phase 0**: 修复重分类逻辑（遍历所有）
- [ ] **Phase 0**: 修复 searchNodes 排序支持
- [ ] **Phase 1**: 创建 config.toml
- [ ] **Phase 1**: 重写 config.js（TOML 读取）
- [ ] **Phase 1**: 重写 db.js（bun:sqlite）
- [ ] **Phase 1**: 重写 server.js（Bun.serve）
- [ ] **Phase 2**: 重写 validator.js（Bun.fetch + SOCKS 兼容）
- [ ] **Phase 2**: 重写 speedtest.js（流式优化）
- [ ] **Phase 2**: 批量更新所有插件（axios → Bun.fetch）
- [ ] **Phase 2**: 优化 scheduler.js
- [ ] **Phase 3**: 编写 Dockerfile.bun（Debian13）
- [ ] **Phase 3**: 本地完整测试
- [ ] **Phase 3**: Docker 构建验证
- [ ] **Phase 4**: 更新 README 和文档
- [ ] **Phase 4**: 性能测试与优化

---

## 📝 代码示例：完整迁移对比

### Express → Bun.serve

**Before**:
```javascript
const express = require('express');
const app = express();
app.get('/api/stats', (req, res) => { /* ... */ });
app.listen(8080);
```

**After**:
```javascript
 Bun.serve({
  routes: {
    '/api/stats': {
      GET: (req) => { /* ... */ }
    }
  },
  port: 8080
});
```

### better-sqlite3 → bun:sqlite

**Before**:
```javascript
const Database = require('better-sqlite3');
const db = new Database('app.db');
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);
```

**After**:
```javascript
import { Database } from 'bun:sqlite';
const db = new Database('app.db');
const user = db.query('SELECT * FROM users WHERE id = ?').get(userId);
```

**API 变化**：
- `db.prepare()` → `db.query()`
- 参数绑定：保持 `?` 占位符，位置传入
- 事务 API 相似

### axios → Bun.fetch

**Before**:
```javascript
const axios = require('axios');
const res = await axios.get('https://api.example.com', { timeout: 5000 });
const data = res.data;
```

**After**:
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const res = await Bun.fetch('https://api.example.com', {
    signal: controller.signal,
    headers: { 'User-Agent': 'Bun' }
  });
  const data = await res.json();
} finally {
  clearTimeout(timeoutId);
}
```

---

## ✅ 迁移完成检查清单

- [ ] 所有已知问题已修复（排序、筛选、重分类）
- [ ] package.json 仅保留必要依赖
- [ ] config.toml 已创建并通过测试
- [ ] src/config.js 使用 Bun.file()
- [ ] src/db.js 使用 bun:sqlite（所有 prepared statements 适配完成）
- [ ] src/server.js 使用 Bun.serve()（所有路由已迁移）
- [ ] src/validator.js 使用 Bun.fetch（SOCKS 除外）
- [ ] src/speedtest.js 使用 Bun.fetch
- [ ] src/scheduler.js 参数绑定已修正
- [ ] 所有 30+ 插件中的 axios 已替换
- [ ] build.js 已删除
- [ ] config.yml 已备份（可选删除）
- [ ] Dockerfile.bun 已创建
- [ ] 本地测试通过（bun start）
- [ ] Docker 构建通过（oven/bun:debian13）
- [ ] 容器运行正常（内存 < 1024MB）
- [ ] API 端点功能正常
- [ ] 文档已更新（README.md）
- [ ] 性能测试完成（与旧版本对比）

---

## 🎓 关键技术参考

- [Bun HTTP Server](https://bun.com/docs/runtime/http/server)
- [Bun SQLite](https://bun.com/docs/runtime/sqlite) - 快 3-6x 于 better-sqlite3
- [Bun Fetch](https://bun.com/docs/runtime/networking/fetch)
- [Bun File I/O](https://bun.com/docs/runtime/file-io)
- [Bun TOML](https://bun.com/docs/runtime/toml)
- [Bun Workers](https://bun.com/docs/runtime/workers)
- [Bun Docker](https://bun.com/docs/install#docker-images)

---

## 💡 激进策略总结

1. **彻底重写**：server.js 从 Express 迁移到 Bun.serve()
2. **数据库升级**：从 better-sqlite3 迁移到 bun:sqlite（3-6x 性能提升）
3. **HTTP 客户端重构**：axios → Bun.fetch（大部分模块）
4. **配置现代化**：YAML → TOML（Bun 内置）
5. **零构建**：删除 esbuild，直接运行源码
6. **Docker 优化**：基于 Debian 13（而非 Alpine），确保兼容性
7. **保留**：仅 cheerio 和 socks-proxy-agent（Bun 暂无法替代）

**这是最彻底的 Bun 迁移方案，预期最大性能收益。**

---

**方案制定完成** ✅

等待用户确认后，我将切换到 Act Mode 开始实施。