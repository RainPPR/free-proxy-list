import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { config, logger } from './config.js';

// 确保数据库目录存在
const dbDir = dirname(config.app.dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// 创建数据库（bun:sqlite API）
import { Database } from 'bun:sqlite';
const db = new Database(config.app.dbPath);

// 设置 WAL 模式
db.exec('PRAGMA cache_size = 4000');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA busy_timeout = 5000');

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

logger.info(`[DB] Using Bun SQLite DB at: ${config.app.dbPath}`);

export const statements = {
  // ----------- 黑名单逻辑 -----------
  insertDeleted: db.query(`INSERT OR REPLACE INTO deleted_logs (hash, deleted_at, region) VALUES (?, ?, ?)`),
  isDeleted: db.query(`SELECT hash FROM deleted_logs WHERE hash = ? AND region = ?`),
  purgeOldDeletedLogs: db.query(`DELETE FROM deleted_logs WHERE deleted_at < ?`),

  // ----------- 代理增删改查 -----------
  insertOrUpdateReadyProxy: db.query(`
    INSERT INTO proxies (
      hash, protocol, ip, port, short_name, long_name, remark, region,
      status, first_added, last_added, last_checked
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, 
      0, ?, ?, 0
    ) 
    ON CONFLICT(hash, region) DO UPDATE SET 
      last_added = excluded.last_added,
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
        WHEN ? >= ? THEN 2 
        WHEN status = 2 AND ? < ? THEN 1 
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

  // 订阅/显示排序（按用户要求的规则，使用 UNION ALL 正确实现三级排序）：
  getAvailableNodesForSub: db.query(`
    SELECT * FROM (
      -- 第一组：高性能节点 (status=2) 按 Google 延迟升序
      SELECT *, 1 as sort_group FROM proxies WHERE status = 2 AND region = ?
      
      UNION ALL
      
      -- 第二组：可用节点且速度≥1MB/s 按延迟降序
      SELECT *, 2 as sort_group FROM proxies WHERE status = 1 AND download_speed_bps >= 1048576 AND region = ?
      
      UNION ALL
      
      -- 第三组：可用节点且速度<1MB/s 按速度降序
      SELECT *, 3 as sort_group FROM proxies WHERE status = 1 AND download_speed_bps < 1048576 AND region = ?
    )
    ORDER BY 
      sort_group,
      CASE 
        WHEN sort_group = 1 THEN COALESCE(google_latency, 999999)  -- 高性能：延迟升序，NULL放最后
        WHEN sort_group = 2 THEN COALESCE(google_latency, 0) * -1  -- 可用且速度≥1MB/s：延迟降序
        WHEN sort_group = 3 THEN COALESCE(download_speed_bps, 0) * -1  -- 可用且速度<1MB/s：速度降序
        ELSE 0 
      END
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
  if (speed) {
    sql += ` AND download_speed_bps >= ?`;
    params.push(parseInt(speed, 10));
  }
  if (delay) {
    const delayField = region === 'cn' ? 'msft_latency' : 'google_latency';
    sql += ` AND ${delayField} <= ? AND ${delayField} > 0`;
    params.push(parseInt(delay, 10));
  }

  // 排序支持：如果指定了sort参数，使用它；否则使用默认排序
  if (sort) {
    const validSortFields = ['google_latency', 'download_speed_bps', 'ping_latency', 'last_checked'];
    if (validSortFields.includes(sort)) {
      const direction = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${sort} ${direction}`;
    } else {
      // 如果sort无效，使用默认排序
      sql += getDefaultOrderSql(listType, region);
    }
  } else {
    // 使用默认排序
    sql += getDefaultOrderSql(listType, region);
  }
  
  sql += ` LIMIT ? OFFSET ?`;
  params.push(safeLimit, offset);

  return db.query(sql).all(...params);
}

function getDefaultOrderSql(listType, region) {
  if (listType === 'highperf') {
    return ` ORDER BY COALESCE(google_latency, 999999) ASC`;
  } else {
    // 默认三级排序规则：
    // 1. 高性能节点在前 (status=2)
    // 2. 高性能节点按 Google 延迟升序
    // 3. 可用节点中速度>=1MB/s的按延迟降序
    // 4. 可用节点中速度<1MB/s的按速度降序
    return ` ORDER BY 
      status DESC,
      CASE 
        WHEN status = 2 THEN COALESCE(google_latency, 999999)
        WHEN status = 1 AND download_speed_bps >= 1048576 THEN COALESCE(google_latency, 0) * -1
        ELSE COALESCE(download_speed_bps, 0) * -1
      END`;
  }
}

/**
 * 重新分类高性能节点（根据配置的高性能标准）
 * 当高性能标准（highPerformanceMinBps）发生变化时，需要调用此函数
 * 遍历所有节点（包括 status=0,1,2），双向调整：
 * - 降级：status=2 但速度 < threshold 的节点降为 status=1
 * - 升级：status<2 但速度 >= threshold 的节点升为 status=2
 * - 注意：status=0 的节点如果速度达标也会被升级
 * @param {string} region - 区域（'global' 或 'cn'），如果为 null 则处理所有区域
 */
export function reclassifyHighPerformanceNodes(region = null) {
  if (region) {
    logger.info(`[DB] 开始重新分类高性能节点 (region: ${region}, threshold: ${config.runtime.highPerformanceMinBps} bps)`);
  } else {
    logger.info(`[DB] 开始重新分类所有区域的高性能节点 (threshold: ${config.runtime.highPerformanceMinBps} bps)`);
  }
  
  try {
    const now = Date.now();
    
    // 查询所有节点（如果指定region则只查询该区域）
    let allNodes;
    if (region) {
      allNodes = db.query(`SELECT * FROM proxies WHERE region = ?`).all(region);
    } else {
      allNodes = db.query(`SELECT * FROM proxies`).all();
    }
    
    logger.info(`[DB] 查询到 ${allNodes.length} 个节点进行重分类`);
    
    let demotedCount = 0;
    let keptCount = 0;
    let promotedCount = 0;
    let unchangedCount = 0;
    
    for (const node of allNodes) {
      const speed = node.download_speed_bps || 0;
      const currentStatus = node.status;
      
      if (currentStatus === 2 && speed < config.runtime.highPerformanceMinBps) {
        // 降级：当前是高性能但不达标 → 降为 status=1
        statements.updateProxySpeed.run(now, speed, speed, config.runtime.highPerformanceMinBps, speed, config.runtime.highPerformanceMinBps, node.hash, node.region);
        demotedCount++;
      } else if (currentStatus < 2 && speed >= config.runtime.highPerformanceMinBps) {
        // 升级：当前非高性能且达标 → 升为 status=2
        statements.updateProxySpeed.run(now, speed, speed, config.runtime.highPerformanceMinBps, speed, config.runtime.highPerformanceMinBps, node.hash, node.region);
        promotedCount++;
      } else if (currentStatus === 2 && speed >= config.runtime.highPerformanceMinBps) {
        // 保持：当前是高性能且达标
        keptCount++;
      } else {
        // 其他情况：不改变状态（例如status=0或1但不达标）
        unchangedCount++;
      }
    }
    
    logger.info(`[DB] 高性能节点重分类完成: 总计 ${allNodes.length}，保持 ${keptCount}，降级 ${demotedCount}，升级 ${promotedCount}，不变 ${unchangedCount}`);
    return { 
      total: allNodes.length, 
      kept: keptCount, 
      demoted: demotedCount,
      promoted: promotedCount,
      unchanged: unchangedCount
    };
  } catch (err) {
    logger.error(`[DB] 重新分类高性能节点失败: ${err.message}`);
    return { error: err.message };
  }
}

export const closeDb = () => {
    logger.info('[DB] Closing Database Connection...');
    db.close();
};

export default db;