import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config, logger } from './config.js';

// 确保目录存在
const dbDir = path.dirname(path.resolve(process.cwd(), config.app.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.app.dbPath);

// WAL 模式支持并发读写
db.pragma('journal_mode = WAL');
// 降低 busy 超时（减少并发锁冲突）
db.pragma('busy_timeout = 5000');

// 初始化各种表
db.exec(`
  CREATE TABLE IF NOT EXISTS proxies (
    hash TEXT PRIMARY KEY,
    protocol TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    short_name TEXT,
    long_name TEXT,
    remark TEXT,
    status INTEGER DEFAULT 0, -- 0: Ready, 1: Available, 2: High-Performance
    first_added INTEGER,
    last_added INTEGER,
    last_checked INTEGER,
    speed_check_time INTEGER,
    ping_latency INTEGER,
    google_latency INTEGER,
    msft_latency INTEGER,
    download_speed_bps INTEGER
  );

  CREATE TABLE IF NOT EXISTS deleted_logs (
    hash TEXT PRIMARY KEY,
    deleted_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
  CREATE INDEX IF NOT EXISTS idx_proxies_last_checked ON proxies(last_checked);
  CREATE INDEX IF NOT EXISTS idx_proxies_highperf ON proxies(status, google_latency, ping_latency);
  CREATE INDEX IF NOT EXISTS idx_proxies_available ON proxies(status, download_speed_bps, ping_latency);
  CREATE INDEX IF NOT EXISTS idx_deleted_logs_at ON deleted_logs(deleted_at);
`);

logger.info(`[DB] Using SQLite DB at: ${config.app.dbPath}`);

export const statements = {
  // ----------- deleted_logs -----------
  insertDeleted: db.prepare(`
    INSERT OR REPLACE INTO deleted_logs (hash, deleted_at) VALUES (?, ?)
  `),
  isDeleted: db.prepare(`
    SELECT hash FROM deleted_logs WHERE hash = ?
  `),
  purgeOldDeletedLogs: db.prepare(`
    DELETE FROM deleted_logs WHERE deleted_at < ?
  `),

  // ----------- proxies -----------
  existsProxy: db.prepare(`
    SELECT hash FROM proxies WHERE hash = ?
  `),
  insertOrUpdateReadyProxy: db.prepare(`
    INSERT INTO proxies (
      hash, protocol, ip, port, short_name, long_name, remark, 
      status, first_added, last_added, last_checked
    ) VALUES (
      @hash, @protocol, @ip, @port, @shortName, @longName, @remark, 
      0, @now, @now, 0
    ) 
    ON CONFLICT(hash) DO UPDATE SET 
      last_added = @now,
      remark = excluded.remark,
      short_name = excluded.short_name
  `),

  // 获取待查验节点（加 LIMIT 1 防并发冲突，多 worker 可能拿同一节点但结果是幂等的）
  getOnePendingValidation: db.prepare(`
    SELECT * FROM proxies WHERE 
      status = 0 OR 
      (status IN (1, 2) AND last_checked < ?) 
    ORDER BY status ASC, last_checked ASC
    LIMIT 1
  `),

  // 批量拿待查验节点（供并发 worker 一次性获取一批）
  getBatchPendingValidation: db.prepare(`
    SELECT * FROM proxies WHERE 
      status = 0 OR 
      (status IN (1, 2) AND last_checked < ?) 
    ORDER BY status ASC, last_checked ASC
    LIMIT ?
  `),

  updateProxyAsAvailable: db.prepare(`
    UPDATE proxies SET 
      status = 1, 
      last_checked = ?, 
      ping_latency = ?, 
      google_latency = ?, 
      msft_latency = ? 
    WHERE hash = ?
  `),

  updateProxySpeed: db.prepare(`
    UPDATE proxies SET 
      speed_check_time = ?, 
      download_speed_bps = ?,
      status = CASE WHEN ? >= ${config.runtime.highPerformanceMinBps} THEN 2 ELSE status END
    WHERE hash = ?
  `),

  deleteProxy: db.prepare(`
    DELETE FROM proxies WHERE hash = ?
  `),

  getStats: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM proxies WHERE status = 0) as readyCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 1) as availableCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 2) as highPerfCount,
      (SELECT COUNT(*) FROM deleted_logs) as deletedLogsCount
  `),

  // 获取可用+高性能列表（排序规则：按状态先2后1；再按协议优先级(socks5/socks4 > https > http)；然后国家优先级；最后详细信息优先级）
  getAvailableNodesForSub: db.prepare(`
    SELECT * FROM proxies 
    WHERE status IN (1, 2) 
    ORDER BY 
      status DESC,              -- HighPerf(2) 在前, Available(1) 在后
      
      -- 第一优先级：协议权重 (socks5/socks4 > https > http)
      CASE 
        WHEN protocol IN ('socks5', 'socks4') THEN 3
        WHEN protocol = 'https' THEN 2
        WHEN protocol = 'http' THEN 1
        ELSE 0
      END DESC,
      
      -- 第二优先级：目标国家优先
      CASE 
        WHEN substr(short_name, 1, instr(short_name, '_') - 1) IN ('HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR') THEN 1
        ELSE 0
      END DESC,
      
      -- 第三优先级：有详细信息优先（short_name 包含 _ 表示有城市信息）
      CASE 
        WHEN short_name IS NOT NULL AND short_name != 'Unknown' AND instr(short_name, '_') > 0 THEN 1
        ELSE 0
      END DESC
    LIMIT ? OFFSET ?
  `),

  // 获取高性能列表（专门的高性能订阅）
  getHighPerformanceNodes: db.prepare(`
    SELECT * FROM proxies 
    WHERE status = 2 
    ORDER BY google_latency ASC, ping_latency ASC
    LIMIT ? OFFSET ?
  `),

  // 统计各状态数量
  getCountsByStatus: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as highperf
    FROM proxies
  `)
};

export const closeDb = () => {
    logger.info('[DB] Closing Database Connection...');
    db.close();
};

export default db;