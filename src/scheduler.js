import { execFile } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { config, logger, globalState } from './config.js';
import db, { statements } from './db.js';

// 清理并确保临时目录存在
function cleanupOldTempFiles() {
    try {
        const tmpDir = os.tmpdir();
        
        // 确保目录存在
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
            logger.info(`[Scheduler] 📂 创建临时目录: ${tmpDir}`);
            return;
        }

        const files = fs.readdirSync(tmpDir);
        let count = 0;
        for (const file of files) {
            if (file.startsWith('freeproxy-') || file.startsWith('proxyscrape-')) {
                try {
                    fs.unlinkSync(path.join(tmpDir, file));
                    count++;
                } catch (e) { /* ignore busy files */ }
            }
        }
        if (count > 0) logger.info(`[Scheduler] 🧹 启动清理: 移除了 ${count} 个残留临时文件`);
    } catch (err) {
        logger.error('[Scheduler] ❌ 启动清理失败:', err.message);
    }
}

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
        let entryAbs = path.resolve(process.cwd(), entry);

        // 生产环境优化：如果运行的是打包后的文件，则重定向插件到对应的打包版本
        const isBundle = process.argv[1].includes('bundle.cjs');
        if (isBundle) {
            const bundledEntry = path.join(process.cwd(), 'dist', entry.replace('.js', '.cjs'));
            if (fs.existsSync(bundledEntry)) {
                entryAbs = bundledEntry;
            }
        }

        logger.info(`[Scheduler] 🚀 触发插件执行 (${isBundle ? 'Standalone' : 'Source'}): ${name}`);

        const MAX_LIFETIME = 600000; // 10 分钟

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
                
                // 极致优化：一旦解析完成，立即删除磁盘文件，不等待入库循环
                try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }

                if (!Array.isArray(nodes)) throw new Error('Invalid JSON array');

                const region = pluginDef.region || 'global';
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
                    
                    // 仅保留必要字段进入待处理队列，节约内存
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

                    // 每 100 个节点让出一次事件循环，并分批提交数据库
                    if (++processedCount % 100 === 0) {
                        addedCount += insertTx(currentBatch, now);
                        currentBatch = [];
                        await new Promise(r => setImmediate(r));
                    }
                }

                // 处理剩余不足 100 的节点
                if (currentBatch.length > 0) {
                    addedCount += insertTx(currentBatch, now);
                }

                logger.info(`[Scheduler] ✅ ${name} 完成。入库: ${addedCount}`);

                // 显式释放大数据引用，加速 GC
                nodes = null;
                currentBatch = null;

            } catch (err) {
                logger.error(`[Scheduler] ❌ ${name} 数据处理失败:`, err.message);
                // 确保在出错路径下也尝试清理
                try {
                    const outputPath = stdout?.trim();
                    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                } catch (e) { /* ignore */ }
            } finally {
                resolve();
            }
        });
    });
}

function processQueue() {
    if (activePluginsCount >= MAX_CONCURRENT_PLUGINS || pluginQueue.length === 0) return;

    const pluginDef = pluginQueue.shift();
    globalState.isPluginRunning = true;
    runPlugin(pluginDef).finally(() => {
        activePluginsCount--;
        globalState.isPluginRunning = false;
        // 插件任务之间增加 2 秒空隙，确保低内存（1024MB）环境下 V8 有时间进行 Full GC
        setTimeout(processQueue, 2000);
    });
}

function queuePlugin(pluginDef) {
    pluginQueue.push(pluginDef);
    processQueue();
}

let pluginInterval = null;

export function initScheduler() {
    logger.info(`[Scheduler] 初始化调度器 (单线程资源优化版)`);

    // 启动前执行一次彻底的临时文件清理
    cleanupOldTempFiles();

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