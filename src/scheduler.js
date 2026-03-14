import crypto from 'node:crypto';
import { plugins as pluginRegistry } from './plugins.js';
import { config, logger, globalState } from './config.js';
import { statements } from './db.js';

let schedulerTimer = null;

/**
 * 计算代理信息的 MD5 哈希，作为唯一 ID
 */
function generateHash(proxy) {
  const s = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * 运行单个插件并入库 (内存模式)
 * @param {string} pluginName 插件名称
 * @param {string} region 区域 (global/cn)
 */
async function runPlugin(pluginName, region) {
  const pluginFn = pluginRegistry[region]?.[pluginName];
  if (!pluginFn) {
    logger.warn(`[Scheduler] ⚠️ 找不到插件映射: ${pluginName} (${region})`);
    return;
  }

  logger.info(`[Scheduler] 🚀 触发插件执行 (Memory): ${pluginName} (${region})`);
  
  try {
    const proxies = await pluginFn();
    if (!Array.isArray(proxies) || proxies.length === 0) {
      logger.info(`[Scheduler] ✅ ${pluginName} 完成，无数据。`);
      return;
    }

    let addedCount = 0;
    const now = Date.now();

    for (const p of proxies) {
      if (!p.ip || !p.port || !p.protocol) continue;
      
      const hash = generateHash(p);
      
      // 检查黑名单 (24小时内标记废弃的)
      const isBlacklisted = statements.isDeleted.get(hash, region);
      if (isBlacklisted) continue;

      statements.insertOrUpdateReadyProxy.run({
        hash,
        protocol: p.protocol.toLowerCase(),
        ip: p.ip,
        port: parseInt(p.port, 10),
        shortName: p.shortName || 'Unknown',
        longName: p.longName || 'Unknown',
        remark: p.remark || pluginName,
        region,
        now
      });
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

  const pluginsConfig = config.plugins.filter(p => p.enabled);
  logger.info(`[Scheduler] 开始由 ${pluginsConfig.length} 个插件构成的采集轮次...`);

  for (const p of pluginsConfig) {
    await runPlugin(p.name, p.region);
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
  
  const intervalMs = (config.pluginIntervalSeconds || 14400) * 1000;
  
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