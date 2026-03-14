import crypto from 'node:crypto';
import { config, logger, globalState } from './config.js';
import db, { statements } from './db.js';
import { plugins as pluginRegistry } from './plugins.js';

// 计算 protocol://ip:port 的 sha256 后 7 位
export function computeHash(protocol, ip, port) {
    const raw = `${protocol}://${ip}:${port}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(-7);
}

// 节点优先级排序
function sortNodes(nodes) {
    const TARGET_COUNTRIES = ['HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR'];
    return nodes.sort((a, b) => {
        const aIsSocks = a.protocol === 'socks5' || a.protocol === 'socks4';
        const bIsSocks = b.protocol === 'socks5' || b.protocol === 'socks4';
        if (aIsSocks !== bIsSocks) return aIsSocks ? 1 : -1;
        
        const aCountry = a.shortName?.split('_')[0] || 'Unknown';
        const bCountry = b.shortName?.split('_')[0] || 'Unknown';
        const aInTarget = TARGET_COUNTRIES.includes(aCountry);
        const bInTarget = TARGET_COUNTRIES.includes(bCountry);
        if (aInTarget !== bInTarget) return aInTarget ? 1 : -1;
        
        const aHasDetail = a.shortName && a.shortName !== 'Unknown' && a.shortName.includes('_');
        const bHasDetail = b.shortName && b.shortName !== 'Unknown' && b.shortName.includes('_');
        if (aHasDetail !== bHasDetail) return aHasDetail ? 1 : -1;
        
        return 0;
    });
}

function runPlugin(pluginDef) {
    return new Promise(async (resolve) => {
        if (!pluginDef.enabled) return resolve();

        const { name, region = 'global' } = pluginDef;
        logger.info(`[Scheduler] 🚀 触发插件执行 (Memory): ${name} (${region})`);

        try {
            // 从注册表中获取插件函数
            const fetchFn = pluginRegistry[region]?.[name.replace('-cn', '')];
            
            if (typeof fetchFn !== 'function') {
                logger.error(`[Scheduler] ❌ 插件 ${name} 未在注册表中找到或格式错误`);
                return resolve();
            }

            // 直接在内存中执行
            let nodes = await fetchFn();

            if (!Array.isArray(nodes)) {
                logger.error(`[Scheduler] ❌ 插件 ${name} 返回的数据不是数组`);
                return resolve();
            }

            const now = Date.now();
            let currentBatch = [];
            let processedCount = 0;
            let addedCount = 0;

            const insertTx = db.transaction((batch, timestamp) => {
                let count = 0;
                for (const node of batch) {
                    try {
                        statements.insertOrUpdateReadyProxy.run({ ...node, now: timestamp });
                        count++;
                    } catch (err) { /* ignore */ }
                }
                return count;
            });

            for (const node of nodes) {
                if (!node || !node.protocol || !node.ip || !node.port) continue;
                
                const hash = computeHash(node.protocol, node.ip, node.port);
                if (statements.isDeleted.get(hash, region)) continue;
                if (statements.existsProxy.get(hash, region)) continue;

                currentBatch.push({
                    hash,
                    protocol: node.protocol,
                    ip: node.ip,
                    port: node.port,
                    shortName: node.shortName || 'Unknown',
                    longName: node.longName || 'Unknown',
                    remark: node.remark || name,
                    region: region
                });

                if (++processedCount % 100 === 0) {
                    addedCount += insertTx(currentBatch, now);
                    currentBatch = [];
                    await new Promise(r => setImmediate(r));
                }
            }

            if (currentBatch.length > 0) {
                addedCount += insertTx(currentBatch, now);
            }

            logger.info(`[Scheduler] ✅ ${name} 完成。入库: ${addedCount}`);

        } catch (err) {
            logger.error(`[Scheduler] ❌ ${name} 执行失败:`, err.message);
        } finally {
            resolve();
        }
    });
}

const pluginQueue = [];
let activePluginsCount = 0;
const MAX_CONCURRENT_PLUGINS = 1;

function processQueue() {
    if (activePluginsCount >= MAX_CONCURRENT_PLUGINS || pluginQueue.length === 0) return;

    activePluginsCount++;
    const pluginDef = pluginQueue.shift();
    globalState.isPluginRunning = true;
    runPlugin(pluginDef).finally(() => {
        activePluginsCount--;
        globalState.isPluginRunning = false;
        setTimeout(processQueue, 2000);
    });
}

function queuePlugin(pluginDef) {
    pluginQueue.push(pluginDef);
    processQueue();
}

let pluginInterval = null;

export function initScheduler() {
    logger.info(`[Scheduler] 初始化调度器 (单线程内存插件版)`);

    config.plugins.forEach(p => {
        if (p.enabled) queuePlugin(p);
    });

    pluginInterval = setInterval(() => {
        logger.info(`[Scheduler] 开始新一轮定时任务...`);
        config.plugins.forEach(p => {
            if (p.enabled) queuePlugin(p);
        });
    }, config.pluginIntervalSeconds * 1000);
}

export function stopScheduler() {
    if (pluginInterval) clearInterval(pluginInterval);
}