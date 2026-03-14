import { execFile } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config, logger } from './config.js';
import db, { statements } from './db.js';

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

const pluginQueue = [];
let activePluginsCount = 0;
// 严格单线程运行插件，降低系统负载，确保前端响应、测速和延迟服务不受影响
const MAX_CONCURRENT_PLUGINS = 1;

function runPlugin(pluginDef) {
    return new Promise((resolve) => {
        if (!pluginDef.enabled) return resolve();

        const { name, entry } = pluginDef;
        const entryAbs = path.resolve(process.cwd(), entry);

        logger.info(`[Scheduler] 🚀 触发插件执行 (单线程模式): ${name}`);

        const MAX_LIFETIME = 1800000; // 30 分钟

        const args = [entryAbs];
        if (pluginDef.args) args.push(...pluginDef.args);

        execFile('node', args, { timeout: MAX_LIFETIME }, async (error, stdout) => {
            try {
                if (error) {
                    logger.error(`[Scheduler] ❌ 插件 ${name} 运行错误:`, error.killed ? 'Timeout' : error.message);
                    return resolve();
                }

                const outputPath = stdout.trim();
                if (!outputPath || !fs.existsSync(outputPath)) {
                    logger.error(`[Scheduler] ❌ 插件 ${name} 未返回有效路径`);
                    return resolve();
                }

                const fileContent = fs.readFileSync(outputPath, 'utf-8');
                let nodes = JSON.parse(fileContent);
                if (!Array.isArray(nodes)) throw new Error('Invalid JSON array');

                const now = Date.now();
                const region = pluginDef.region || 'global';

                const deduped = [];
                let i = 0;

                for (const node of nodes) {
                    // 每 200 个节点让出一次事件循环，确保网络 I/O 能够被主程序处理
                    if (++i % 200 === 0) await new Promise(r => setImmediate(r));

                    if (!node || !node.protocol || !node.ip || !node.port) continue;
                    const hash = computeHash(node.protocol, node.ip, node.port);

                    if (statements.isDeleted.get(hash, region)) continue;
                    if (statements.existsProxy.get(hash, region)) continue;

                    deduped.push({
                        hash,
                        protocol: node.protocol,
                        ip: node.ip,
                        port: node.port,
                        shortName: node.shortName || 'Unknown',
                        longName: node.longName || 'Unknown',
                        remark: node.remark || name,
                        region: region
                    });
                }

                sortNodes(deduped);

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

                let addedCount = 0;
                // 事务分批更细化，每 200 个提交一次，降低对 DB 的长时间独占
                for (let j = 0; j < deduped.length; j += 200) {
                    const batch = deduped.slice(j, j + 200);
                    addedCount += insertTx(batch, now);
                    await new Promise(r => setImmediate(r));
                }

                logger.info(`[Scheduler] ✅ ${name} 完成。写入: ${addedCount}`);

                try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }

            } catch (err) {
                logger.error(`[Scheduler] ❌ ${name} 数据处理失败:`, err.message);
            } finally {
                resolve();
            }
        });
    });
}

function processQueue() {
    if (activePluginsCount >= MAX_CONCURRENT_PLUGINS || pluginQueue.length === 0) return;

    const pluginDef = pluginQueue.shift();
    activePluginsCount++;

    runPlugin(pluginDef).finally(() => {
        activePluginsCount--;
        // 插件任务之间增加 1 秒空隙，彻底让出系统资源
        setTimeout(processQueue, 1000);
    });
}

function queuePlugin(pluginDef) {
    pluginQueue.push(pluginDef);
    processQueue();
}

let pluginInterval = null;

export function initScheduler() {
    logger.info(`[Scheduler] 初始化调度器 (单线程资源优化版)`);

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