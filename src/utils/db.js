/**
 * 数据库工具模块
 * 封装数据库操作，提供统一的接口，方便迁移
 * 
 * 注意：当前使用 Bun 的 bun:sqlite
 * 如需迁移到 Node.js，可替换为 better-sqlite3 或 sql.js
 */

import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config, logger } from '../config.js';

// ============= 数据库初始化 =============

let db = null;

/**
 * 初始化数据库连接
 * @param {Object} dbModule - 数据库模块 (bun:sqlite 或其他)
 * @returns {Object} 数据库实例
 */
export function initDatabase(dbModule) {
  if (db) return db;

  const dbPath = config.app.dbPath;
  
  // 确保目录存在
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // 创建数据库实例
  db = new dbModule.Database(dbPath);
  
  // 设置性能优化参数
  db.exec('PRAGMA cache_size = 4000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');

  logger.info(`[DB] Database initialized at: ${dbPath}`);
  
  return db;
}

/**
 * 获取数据库实例
 * @returns {Object} 数据库实例
 */
export function getDb() {
  return db;
}

/**
 * 初始化表结构
 * @param {Object} database - 数据库实例
 */
export function initTables(database) {
  database.exec(`
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
}

// ============= 代理哈希工具 =============

/**
 * 生成代理的唯一哈希
 * @param {string} protocol - 协议 (http, https, socks5, socks4)
 * @param {string} ip - IP地址
 * @param {number} port - 端口
 * @returns {string} 哈希字符串
 */
export function generateProxyHash(protocol, ip, port) {
  // 简单的哈希生成，使用 SHA-256
  const input = `${protocol}://${ip}:${port}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ============= 代理数据验证 =============

/**
 * 验证代理数据是否有效
 * @param {Object} proxy - 代理对象
 * @returns {boolean} 是否有效
 */
export function isValidProxy(proxy) {
  if (!proxy) return false;
  if (!proxy.protocol || !proxy.ip || !proxy.port) return false;
  if (typeof proxy.port !== 'number' || proxy.port < 1 || proxy.port > 65535) return false;
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(proxy.ip) && !/^[a-f0-9:]+$/i.test(proxy.ip)) return false;
  return true;
}

/**
 * 验证IP地址是否有效
 * @param {string} ip - IP地址
 * @returns {boolean} 是否有效
 */
export function isValidIp(ip) {
  if (!ip) return false;
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every(part => parseInt(part) <= 255);
  }
  // IPv6 (简化检查)
  if (/^[a-f0-9:]+$/i.test(ip)) {
    return true;
  }
  return false;
}

/**
 * 验证端口是否有效
 * @param {number|string} port - 端口
 * @returns {boolean} 是否有效
 */
export function isValidPort(port) {
  const portNum = parseInt(port);
  return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
}

/**
 * 验证区域代码
 * @param {string} region - 区域代码
 * @returns {boolean} 是否有效
 */
export function isValidRegion(region) {
  const validRegions = ['global', 'cn'];
  return validRegions.includes(region);
}

// ============= 数据格式化 =============

/**
 * 格式化代理数据用于数据库存储
 * @param {Object} proxy - 原始代理数据
 * @param {string} region - 区域
 * @returns {Object} 格式化后的数据
 */
export function formatProxyForDb(proxy, region = 'global') {
  const now = Date.now();
  return {
    hash: generateProxyHash(proxy.protocol, proxy.ip, proxy.port),
    protocol: proxy.protocol.toLowerCase(),
    ip: proxy.ip,
    port: parseInt(proxy.port),
    short_name: proxy.short_name || null,
    long_name: proxy.long_name || null,
    remark: proxy.remark || null,
    region: region,
    status: 0,
    first_added: now,
    last_added: now,
    last_checked: 0
  };
}

/**
 * 从数据库结果中提取代理信息
 * @param {Object} row - 数据库行
 * @returns {Object} 代理对象
 */
export function extractProxyFromRow(row) {
  if (!row) return null;
  return {
    hash: row.hash,
    protocol: row.protocol,
    ip: row.ip,
    port: row.port,
    short_name: row.short_name,
    long_name: row.long_name,
    remark: row.remark,
    region: row.region,
    status: row.status,
    first_added: row.first_added,
    last_added: row.last_added,
    last_checked: row.last_checked,
    speed_check_time: row.speed_check_time,
    ping_latency: row.ping_latency,
    google_latency: row.google_latency,
    msft_latency: row.msft_latency,
    hicmatch_latency: row.hicmatch_latency,
    download_speed_bps: row.download_speed_bps
  };
}

// ============= 批量操作 =============

/**
 * 批量插入代理
 * @param {Object} db - 数据库实例
 * @param {Array<Object>} proxies - 代理数组
 * @param {Function} insertStmt - 插入语句
 * @returns {number} 插入数量
 */
export function batchInsertProxies(db, proxies, insertStmt) {
  let count = 0;
  const insertMany = db.transaction((proxies) => {
    for (const proxy of proxies) {
      try {
        insertStmt.run(
          proxy.hash,
          proxy.protocol,
          proxy.ip,
          proxy.port,
          proxy.short_name,
          proxy.long_name,
          proxy.remark,
          proxy.region,
          proxy.status,
          proxy.first_added,
          proxy.last_added,
          proxy.last_checked
        );
        count++;
      } catch (e) {
        // 忽略重复等错误
      }
    }
  });
  insertMany(proxies);
  return count;
}

// ============= 状态常量 =============

export const ProxyStatus = {
  PENDING: 0,      // 待验证
  AVAILABLE: 1,    // 可用
  HIGH_PERF: 2     // 高性能
};

export const ProxyProtocols = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4'
};
