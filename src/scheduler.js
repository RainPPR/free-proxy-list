import plugins from './plugins/plugins.js';
import { config, logger, globalState } from './config.js';
import { statements } from './db.js';

let schedulerTimer = null;

/**
 * 计算代理信息的 MD5 哈希，作为唯一 ID
 */
function generateHash(proxy) {
  const s = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
  // 使用Bun内置的Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  const hashBuffer = Bun.CryptoHasher.hash('md5', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 三级优先级排序函数
 * 优先级：1) SOCKS优先 2) 目标国家优先 3) 信息完整优先
 */
function sortProxiesByPriority(proxies) {
  const priorityCountries = ['HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR'];
  
  return proxies.sort((a, b) => {
    // 第一级：协议优先级
    const getProtocolPriority = (p) => {
      if (p.protocol === 'socks5' || p.protocol === 'socks4') return 1;
      if (p.protocol === 'https') return 2;
      return 3; // http 或其他
    };
    const p1 = getProtocolPriority(a);
    const p2 = getProtocolPriority(b);
    if (p1 !== p2) return p1 - p2;

    // 第二级：国家优先级
    const getCountryPriority = (p) => {
      const country = p.shortName || 'ZZ';
      if (priorityCountries.includes(country)) return 1;
      if (country !== 'ZZ' && country !== null) return 2;
      return 3;
    };
    const c1 = getCountryPriority(a);
    const c2 = getCountryPriority(b);
    if (c1 !== c2) return c1 - c2;

    // 第三级：信息完整度（是否有城市信息）
    const getInfoPriority = (p) => {
      const hasCity = p.longName && p.longName !== 'Unknown' && p.longName !== p.shortName;
      return hasCity ? 1 : 2;
    };
    const i1 = getInfoPriority(a);
    const i2 = getInfoPriority(b);
    if (i1 !== i2) return i1 - i2;

    return 0; // 保持原有顺序
  });
}

/**
 * 运行单个插件并入库 (内存模式)
 * @param {Object} plugin 插件配置对象，包含 name, region, fn 等属性
 */
async function runPlugin(plugin) {
  const pluginFn = plugin.fn;
  const pluginName = plugin.name;
  const region = plugin.region;
  
  if (!pluginFn) {
    logger.warn(`[Scheduler] ⚠️ 找不到插件函数: ${pluginName} (${region})`);
    return;
  }

  logger.info(`[Scheduler] 🚀 触发插件执行 (Memory): ${pluginName} (${region})`);
  
  try {
    const proxies = await pluginFn();
    if (!Array.isArray(proxies) || proxies.length === 0) {
      logger.info(`[Scheduler] ✅ ${pluginName} 完成，无数据。`);
      return;
    }

    // 按三级优先级排序
    sortProxiesByPriority(proxies);

    let addedCount = 0;
    const now = Date.now();

    for (const p of proxies) {
      if (!p.ip || !p.port || !p.protocol) continue;
      
      const hash = generateHash(p);
      
      // 检查黑名单 (24小时内标记废弃的)
      const isBlacklisted = statements.isDeleted.get(hash, region);
      if (isBlacklisted) continue;

      statements.insertOrUpdateReadyProxy.run(
        hash,
        p.protocol.toLowerCase(),
        p.ip,
        parseInt(p.port, 10),
        p.shortName || 'Unknown',
        p.longName || 'Unknown',
        p.remark || pluginName,
        region,
        now,  // first_added
        now   // last_added (ON CONFLICT 会更新)
      );
      addedCount++;
    }

    logger.info(`[Scheduler] ✅ ${pluginName} 完成。入库: ${addedCount}`);
  } catch (err) {
    logger.error(`[Scheduler] ❌ 插件 ${pluginName} 运行崩溃: ${err.message}`);
  }
}

/**
 * 执行所有已启用插件的一个轮次
 */
async function runScheduleBatch() {
  if (globalState.isPluginRunning) return;
  globalState.isPluginRunning = true;

  const pluginsConfig = plugins.plugins.filter(p => p.enabled);
  logger.info(`[Scheduler] 开始由 ${pluginsConfig.length} 个插件构成的采集轮次...`);

  for (const p of pluginsConfig) {
    await runPlugin(p);
    // 每个插件执行完后微休眠，给验证引擎留点资源，也让 GC 有机会工作
    await new Promise(r => setTimeout(r, 2000));
  }

  globalState.isPluginRunning = false;
  logger.info(`[Scheduler] 全量采集轮次结束。`);
}

/**
 * 初始化调度器
 */
export function initScheduler() {
  logger.info(`[Scheduler] 初始化调度器`);
  
  const intervalMs = (config.plugin_interval_seconds || 21600) * 1000;
  
  // 启动即刻执行一次
  runScheduleBatch();
  
  // 定时执行
  schedulerTimer = setInterval(runScheduleBatch, intervalMs);
}

/**
 * 停止调度器
 */
export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}