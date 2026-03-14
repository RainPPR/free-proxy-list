import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config, logger } from './config.js';

// 确保数据库目录存在
const dbDir = path.dirname(path.resolve(process.cwd(), config.app.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.app.dbPath);

/**
 * SQLite 性能与内存配置 (针对 1024MB RAM 优化)
 */
db.pragma('cache_size = 4000'); // 进一步降低缓存至约 16MB
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

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

  -- 精简索引，仅保留核心加速项
  CREATE INDEX IF NOT EXISTS idx_proxies_status_region ON proxies(status, region);
  CREATE INDEX IF NOT EXISTS idx_proxies_lc_region ON proxies(last_checked, region);
  CREATE INDEX IF NOT EXISTS idx_deleted_logs_at ON deleted_logs(deleted_at);
`);

logger.info(`[DB] Using SQLite DB at: ${config.app.dbPath} (Low Memory Mode)`);

export const statements = {
  // ----------- 黑名单逻辑 -----------
  insertDeleted: db.prepare(`
    INSERT OR REPLACE INTO deleted_logs (hash, deleted_at, region) VALUES (?, ?, ?)
  `),
  isDeleted: db.prepare(`
    SELECT hash FROM deleted_logs WHERE hash = ? AND region = ?
  `),
  purgeOldDeletedLogs: db.prepare(`
    DELETE FROM deleted_logs WHERE deleted_at < ?
  `),

  // ----------- 代理增删改查 -----------
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

  getAvailableNodesForSub: db.prepare(`
    SELECT * FROM proxies 
    WHERE status IN (1, 2) AND region = ?
    ORDER BY status DESC, download_speed_bps DESC, last_checked DESC
    LIMIT ? OFFSET ?
  `),

  getHighPerformanceNodes: db.prepare(`
    SELECT * FROM proxies 
    WHERE status = 2 AND region = ?
    ORDER BY download_speed_bps DESC
    LIMIT ? OFFSET ?
  `),
  
  clearAllData: db.prepare(`DELETE FROM proxies`),
  clearDeletedLogs: db.prepare(`DELETE FROM deleted_logs`)
};

/**
 * 动态搜索节点 (优化了查询条件)
 */
export function searchNodes(filters = {}) {
  const { country, type, speed, delay, sort, order, page = 1, limit = 500, region = 'global', listType = 'available' } = filters;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), 1000);
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * safeLimit;
  
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
    const delayField = region === 'cn' ? 'msft_latency' : 'google_latency';
    sql += ` AND ${delayField} <= ? AND ${delayField} > 0`;
    params.push(parseInt(delay, 10));
  }

  const allowedSortFields = ['protocol', 'short_name', 'download_speed_bps', 'google_latency', 'last_checked'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'status';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
  
  sql += ` ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);

  return db.prepare(sql).all(...params);
}

export const closeDb = () => {
    logger.info('[DB] Closing Database Connection...');
    db.close();
};

export default db;