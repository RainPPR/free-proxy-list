/**
 * 数据处理模块
 * 封装代理数据的处理、筛选、分类等逻辑
 * 方便在不同运行时间迁移和兼容性处理
 */

import { config } from './config.js';

// ============= 配置阈值 =============

const HIGH_PERFORMANCE_MIN_BPS = 5242880; // 5MB/s = 5 * 1024 * 1024 = 5242880

// ============= 数据筛选 =============

/**
 * 筛选有效的代理数据
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Array<Object>} 有效的代理数组
 */
export function filterValidProxies(proxies) {
  return proxies.filter(proxy => {
    // 检查必需字段
    if (!proxy.protocol || !proxy.ip || !proxy.port) return false;
    
    // 检查端口范围
    const port = parseInt(proxy.port);
    if (isNaN(port) || port < 1 || port > 65535) return false;
    
    // 检查IP格式
    const ip = proxy.ip;
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^[a-fA-F0-9:]+$/;
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) return false;
    
    // 检查协议
    const validProtocols = ['http', 'https', 'socks5', 'socks4', 'socks'];
    if (!validProtocols.includes(proxy.protocol.toLowerCase())) return false;
    
    return true;
  });
}

/**
 * 按协议筛选代理
 * @param {Array<Object>} proxies - 代理数组
 * @param {Array<string>} protocols - 协议数组
 * @returns {Array<Object>} 筛选后的代理数组
 */
export function filterByProtocol(proxies, protocols) {
  const protocolSet = new Set(protocols.map(p => p.toLowerCase()));
  return proxies.filter(proxy => protocolSet.has(proxy.protocol.toLowerCase()));
}

/**
 * 按区域筛选代理
 * @param {Array<Object>} proxies - 代理数组
 * @param {string} region - 区域 (global/cn)
 * @returns {Array<Object>} 筛选后的代理数组
 */
export function filterByRegion(proxies, region) {
  return proxies.filter(proxy => proxy.region === region);
}

/**
 * 按状态筛选代理
 * @param {Array<Object>} proxies - 代理数组
 * @param {number} status - 状态 (0=待验证, 1=可用, 2=高性能)
 * @returns {Array<Object>} 筛选后的代理数组
 */
export function filterByStatus(proxies, status) {
  return proxies.filter(proxy => proxy.status === status);
}

/**
 * 筛选高性能代理
 * @param {Array<Object>} proxies - 代理数组
 * @param {number} minBps - 最低速度 (bps)
 * @returns {Array<Object>} 高性能代理数组
 */
export function filterHighPerformance(proxies, minBps = HIGH_PERFORMANCE_MIN_BPS) {
  return proxies.filter(proxy => 
    proxy.status === 2 || 
    (proxy.download_speed_bps && proxy.download_speed_bps >= minBps)
  );
}

/**
 * 筛选低延迟代理
 * @param {Array<Object>} proxies - 代理数组
 * @param {number} maxLatency - 最大延迟 (ms)
 * @returns {Array<Object>} 低延迟代理数组
 */
export function filterLowLatency(proxies, maxLatency = 200) {
  return proxies.filter(proxy => 
    proxy.google_latency && 
    proxy.google_latency > 0 && 
    proxy.google_latency <= maxLatency
  );
}

// ============= 数据分类 =============

/**
 * 按协议分类代理
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Object} 按协议分类的代理对象
 */
export function classifyByProtocol(proxies) {
  const result = {};
  for (const proxy of proxies) {
    const protocol = proxy.protocol.toLowerCase();
    if (!result[protocol]) {
      result[protocol] = [];
    }
    result[protocol].push(proxy);
  }
  return result;
}

/**
 * 按区域分类代理
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Object} 按区域分类的代理对象
 */
export function classifyByRegion(proxies) {
  const result = {};
  for (const proxy of proxies) {
    const region = proxy.region || 'global';
    if (!result[region]) {
      result[region] = [];
    }
    result[region].push(proxy);
  }
  return result;
}

/**
 * 按状态分类代理
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Object} 按状态分类的代理对象
 */
export function classifyByStatus(proxies) {
  const result = {
    pending: [],
    available: [],
    high_performance: []
  };
  
  for (const proxy of proxies) {
    switch (proxy.status) {
      case 0:
        result.pending.push(proxy);
        break;
      case 1:
        result.available.push(proxy);
        break;
      case 2:
        result.high_performance.push(proxy);
        break;
    }
  }
  
  return result;
}

// ============= 数据排序 =============

/**
 * 按延迟排序（升序）
 * @param {Array<Object>} proxies - 代理数组
 * @param {string} latencyField - 延迟字段名
 * @returns {Array<Object>} 排序后的代理数组
 */
export function sortByLatency(proxies, latencyField = 'google_latency') {
  return [...proxies].sort((a, b) => {
    const aLatency = a[latencyField] || Infinity;
    const bLatency = b[latencyField] || Infinity;
    return aLatency - bLatency;
  });
}

/**
 * 按速度排序（降序）
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Array<Object>} 排序后的代理数组
 */
export function sortBySpeed(proxies) {
  return [...proxies].sort((a, b) => {
    const aSpeed = a.download_speed_bps || 0;
    const bSpeed = b.download_speed_bps || 0;
    return bSpeed - aSpeed;
  });
}

/**
 * 按最后检查时间排序
 * @param {Array<Object>} proxies - 代理数组
 * @param {boolean} ascending - 是否升序
 * @returns {Array<Object>} 排序后的代理数组
 */
export function sortByLastChecked(proxies, ascending = true) {
  return [...proxies].sort((a, b) => {
    const aTime = a.last_checked || 0;
    const bTime = b.last_checked || 0;
    return ascending ? aTime - bTime : bTime - aTime;
  });
}

// ============= 数据转换 =============

/**
 * 转换为订阅格式 (Base64)
 * @param {Array<Object>} proxies - 代理数组
 * @param {string} format - 格式 (surge/v2ray/clash)
 * @returns {string} 订阅内容
 */
export function toSubscriptionFormat(proxies, format = 'surge') {
  switch (format.toLowerCase()) {
    case 'surge':
      return toSurgeFormat(proxies);
    case 'v2ray':
      return toV2RayFormat(proxies);
    case 'clash':
      return toClashFormat(proxies);
    default:
      return toSurgeFormat(proxies);
  }
}

/**
 * 转换为Surge格式
 * @param {Array<Object>} proxies - 代理数组
 * @returns {string} Surge配置
 */
function toSurgeFormat(proxies) {
  const lines = [];
  for (const proxy of proxies) {
    const { protocol, ip, port, remark, short_name } = proxy;
    const name = remark || short_name || `${ip}:${port}`;
    lines.push(`${name}=${protocol},${ip},${port}`);
  }
  return lines.join('\n');
}

/**
 * 转换为V2Ray格式
 * @param {Array<Object>} proxies - 代理数组
 * @returns {string} V2Ray配置 (JSON)
 */
function toV2RayFormat(proxies) {
  const nodes = proxies.map(proxy => ({
    add: proxy.ip,
    port: proxy.port,
    method: 'aes-128-gcm',
    protocol: proxy.protocol === 'socks5' ? 'socks' : 'vmess',
    uuid: '00000000-0000-0000-0000-000000000000',
    alterId: 0
  }));
  return JSON.stringify(nodes, null, 2);
}

/**
 * 转换为Clash格式
 * @param {Array<Object>} proxies - 代理数组
 * @returns {string} Clash配置 (YAML)
 */
function toClashFormat(proxies) {
  const proxies2 = proxies.map(proxy => {
    const base = {
      name: proxy.remark || proxy.short_name || `${proxy.ip}:${proxy.port}`,
      type: proxy.protocol === 'socks5' ? 'socks5' : proxy.protocol,
      server: proxy.ip,
      port: proxy.port
    };
    
    if (proxy.protocol === 'http' || proxy.protocol === 'https') {
      base.tls = proxy.protocol === 'https';
    }
    
    return base;
  });
  
  let yaml = 'proxies:\n';
  for (const p of proxies2) {
    yaml += `  - name: "${p.name}"\n`;
    yaml += `    type: ${p.type}\n`;
    yaml += `    server: ${p.server}\n`;
    yaml += `    port: ${p.port}\n`;
    if (p.tls) yaml += `    tls: true\n`;
  }
  return yaml;
}

// ============= 数据统计 =============

/**
 * 统计代理数据
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Object} 统计数据
 */
export function getProxyStats(proxies) {
  const stats = {
    total: proxies.length,
    byProtocol: {},
    byRegion: {},
    byStatus: {
      pending: 0,
      available: 0,
      high_performance: 0
    },
    avgSpeed: 0,
    avgLatency: 0
  };
  
  let totalSpeed = 0;
  let totalLatency = 0;
  let speedCount = 0;
  let latencyCount = 0;
  
  for (const proxy of proxies) {
    // 按协议统计
    const protocol = proxy.protocol.toLowerCase();
    stats.byProtocol[protocol] = (stats.byProtocol[protocol] || 0) + 1;
    
    // 按区域统计
    const region = proxy.region || 'global';
    stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
    
    // 按状态统计
    switch (proxy.status) {
      case 0: stats.byStatus.pending++; break;
      case 1: stats.byStatus.available++; break;
      case 2: stats.byStatus.high_performance++; break;
    }
    
    // 累加速度和延迟
    if (proxy.download_speed_bps) {
      totalSpeed += proxy.download_speed_bps;
      speedCount++;
    }
    if (proxy.google_latency && proxy.google_latency > 0) {
      totalLatency += proxy.google_latency;
      latencyCount++;
    }
  }
  
  stats.avgSpeed = speedCount > 0 ? Math.floor(totalSpeed / speedCount) : 0;
  stats.avgLatency = latencyCount > 0 ? Math.floor(totalLatency / latencyCount) : 0;
  
  return stats;
}

/**
 * 判断代理是否为高性能
 * @param {Object} proxy - 代理对象
 * @param {number} threshold - 速度阈值 (bps)
 * @returns {boolean} 是否为高性能
 */
export function isHighPerformance(proxy, threshold = HIGH_PERFORMANCE_MIN_BPS) {
  return proxy.status === 2 || 
    (proxy.download_speed_bps && proxy.download_speed_bps >= threshold);
}

// ============= 数据去重 =============

/**
 * 按IP和端口去重
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Array<Object>} 去重后的代理数组
 */
export function deduplicateProxies(proxies) {
  const seen = new Set();
  const result = [];
  
  for (const proxy of proxies) {
    const key = `${proxy.ip}:${proxy.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(proxy);
    }
  }
  
  return result;
}

/**
 * 按哈希去重
 * @param {Array<Object>} proxies - 代理数组
 * @returns {Array<Object>} 去重后的代理数组
 */
export function deduplicateByHash(proxies) {
  const seen = new Set();
  const result = [];
  
  for (const proxy of proxies) {
    if (!seen.has(proxy.hash)) {
      seen.add(proxy.hash);
      result.push(proxy);
    }
  }
  
  return result;
}
