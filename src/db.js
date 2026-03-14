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

// 强制限制 SQLite 的内存页面缓存（例如限制为 32MB）
db.pragma('cache_size = 8000'); 
// WAL 模式支持并发读写
db.pragma('journal_mode = WAL');
// 性能优化：在保证基本安全的前提下，大幅减少磁盘等待
db.pragma('synchronous = NORMAL');
// 降低 busy 超时（减少并发锁冲突）
db.pragma('busy_timeout = 5000');

// 初始化各种表
db.exec(`
  CREATE TABLE IF NOT EXISTS proxies (
    hash TEXT NOT NULL,
    protocol TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    short_name TEXT,
    long_name TEXT,
    remark TEXT,
    region TEXT DEFAULT 'global', -- 'global' 或 'cn'
    status INTEGER DEFAULT 0, -- 0: Ready, 1: Available, 2: High-Performance
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
  CREATE INDEX IF NOT EXISTS idx_proxies_highperf ON proxies(status, region, google_latency, ping_latency);
  CREATE INDEX IF NOT EXISTS idx_proxies_available ON proxies(status, region, download_speed_bps, ping_latency);
  CREATE INDEX IF NOT EXISTS idx_deleted_logs_at ON deleted_logs(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_deleted_logs_hash_region ON deleted_logs(hash, region);
`);

logger.info(`[DB] Using SQLite DB at: ${config.app.dbPath}`);

export const statements = {
  // ----------- deleted_logs -----------
  insertDeleted: db.prepare(`
    INSERT OR REPLACE INTO deleted_logs (hash, deleted_at, region) VALUES (?, ?, ?)
  `),
  isDeleted: db.prepare(`
    SELECT hash FROM deleted_logs WHERE hash = ? AND region = ?
  `),
  purgeOldDeletedLogs: db.prepare(`
    DELETE FROM deleted_logs WHERE deleted_at < ?
  `),

  // ----------- proxies -----------
  existsProxy: db.prepare(`
    SELECT hash FROM proxies WHERE hash = ? AND region = ?
  `),
  insertOrUpdateReadyProxy: db.prepare(`
    INSERT INTO proxies (
      hash, protocol, ip, port, short_name, long_name, remark, region,
      status, first_added, last_added, last_checked
    ) VALUES (
      @hash, @protocol, @ip, @port, @shortName, @longName, @remark, @region,
      0, @now, @now, 0
    ) 
    ON CONFLICT(hash, region) DO UPDATE SET 
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
      msft_latency = ?,
      hicmatch_latency = ?
    WHERE hash = ? AND region = ?
  `),

  updateProxySpeed: db.prepare(`
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

  deleteProxy: db.prepare(`
    DELETE FROM proxies WHERE hash = ? AND region = ?
  `),

  getStats: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM proxies WHERE status = 0 AND region = ?) as readyCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 1 AND region = ?) as availableCount,
      (SELECT COUNT(*) FROM proxies WHERE status = 2 AND region = ?) as highPerfCount,
      (SELECT COUNT(*) FROM deleted_logs WHERE region = ?) as deletedLogsCount
  `),

  // 获取可用+高性能列表 (用于全量订阅)
  getAvailableNodesForSub: db.prepare(`
    SELECT * FROM proxies 
    WHERE status IN (1, 2) AND region = ?
    ORDER BY 
      -- 1. 状态：高性能在前
      status DESC,
      
      -- 2. 协议优先级：Socks5 > Socks4 > Https > Http
      CASE 
        WHEN protocol = 'socks5' THEN 4
        WHEN protocol = 'socks4' THEN 3
        WHEN protocol = 'https' THEN 2
        WHEN protocol = 'http' THEN 1
        ELSE 0
      END DESC,
      
      -- 3. 目标国家优先级
      CASE 
        WHEN substr(short_name, 1, instr(short_name, '_') - 1) IN ('HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR') THEN 1
        ELSE 0
      END DESC,

      -- 4. 城市详细信息
      CASE 
        WHEN short_name IS NOT NULL AND short_name != 'Unknown' AND instr(short_name, '_') > 0 THEN 1
        ELSE 0
      END DESC,

      -- 5. 质量参考：延迟升序
      google_latency ASC,
      ping_latency ASC
    LIMIT ? OFFSET ?
  `),

  // 获取高性能列表 (用于特供订阅)
  getHighPerformanceNodes: db.prepare(`
    SELECT * FROM proxies 
    WHERE status = 2 AND region = ?
    ORDER BY google_latency ASC, ping_latency ASC
    LIMIT ? OFFSET ?
  `),

  getCountsByStatus: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as highperf
    FROM proxies
    WHERE region = ?
  `),
  
  clearAllData: db.prepare(`
    DELETE FROM proxies;
  `),
  
  clearDeletedLogs: db.prepare(`
    DELETE FROM deleted_logs;
  `)
};

/**
 * 动态搜索节点
 */
export function searchNodes(filters = {}) {
  const { country, type, speed, delay, sort, order, page = 1, limit = 500, region = 'global', listType = 'available' } = filters;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), 1000);
  const safePage = Math.max(1, parseInt(page, 10));
  const offset = (safePage - 1) * safeLimit;
  
  let sql = listType === 'highperf' 
    ? `SELECT * FROM proxies WHERE status = 2 AND region = ?`
    : `SELECT * FROM proxies WHERE status IN (1, 2) AND region = ?`;
  const params = [region];

  if (country) {
    sql += ` AND short_name LIKE ?`;
    params.push(`${country}%`);
  }
  if (type) {
    sql += ` AND protocol = ?`;
    params.push(type.toLowerCase());
  }
  if (delay) {
    // 延迟过滤器根据区域选择主要参考字段
    const delayField = region === 'cn' ? 'msft_latency' : 'google_latency';
    sql += ` AND ${delayField} <= ? AND ${delayField} > 0`;
    params.push(parseInt(delay, 10));
  }

  // 排序处理
  const allowedSortFields = ['protocol', 'short_name', 'download_speed_bps', 'google_latency', 'msft_latency', 'hicmatch_latency', 'last_checked'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'status';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
  
  // 如果是 status 排序，加上默认的次级排序
  if (sortField === 'status') {
    sql += ` ORDER BY status DESC, download_speed_bps DESC, google_latency ASC`;
  } else {
    sql += ` ORDER BY ${sortField} ${sortOrder}`;
  }

  sql += ` LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);

  return db.prepare(sql).all(...params);
}

export const closeDb = () => {
    logger.info('[DB] Closing Database Connection...');
    db.close();
};

export default db;