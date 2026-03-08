import { execFile } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config, logger } from './config.js';
import { statements } from './db.js';

// 计算 protocol://ip:port 的 sha256 后 7 位
export function computeHash(protocol, ip, port) {
    const raw = `${protocol}://${ip}:${port}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(-7);
}

// 三级优先级排序： socks优先 > 目标国家优先 > 有详细信息优先
function sortNodes(nodes) {
  const TARGET_COUNTRIES = ['HK', 'TW', 'SG', 'JP', 'GB', 'US', 'DE', 'KR'];
  
  return nodes.sort((a, b) => {
    // 第一优先级：SOCKS5/SOCKS4 优先
    const aIsSocks = a.protocol === 'socks5' || a.protocol === 'socks4';
    const bIsSocks = b.protocol === 'socks5' || b.protocol === 'socks4';
    if (aIsSocks !== bIsSocks) return aIsSocks ? 1 : -1;
    
    // 第二优先级：目标国家优先
    const aCountry = a.shortName?.split('_')[0] || 'Unknown';
    const bCountry = b.shortName?.split('_')[0] || 'Unknown';
    const aInTarget = TARGET_COUNTRIES.includes(aCountry);
    const bInTarget = TARGET_COUNTRIES.includes(bCountry);
    if (aInTarget !== bInTarget) return aInTarget ? 1 : -1;
    
    // 第三优先级：有详细信息优先（shortName 包含 _ 表示有城市信息）
    const aHasDetail = a.shortName && a.shortName !== 'Unknown' && a.shortName.includes('_');
    const bHasDetail = b.shortName && b.shortName !== 'Unknown' && b.shortName.includes('_');
    if (aHasDetail !== bHasDetail) return aHasDetail ? 1 : -1;
    
    return 0;
  });
}

// 执行单一插件的包装器
function runPlugin(pluginDef) {
    if (!pluginDef.enabled) return;

    const { name, command, entry } = pluginDef;
    const entryAbs = path.resolve(process.cwd(), entry);

    logger.info(`[Scheduler] 🚀 触发插件执行: ${name} (${command} ${entryAbs})`);

    const MAX_LIFETIME = 120000;

    execFile(command, [entryAbs], { timeout: MAX_LIFETIME }, (error, stdout, stderr) => {
        if (error) {
            if (error.killed) {
                logger.error(`[Scheduler] ❌ 插件 ${name} 运行超时(${MAX_LIFETIME}ms)，已被强杀。`);
            } else {
                logger.error(`[Scheduler] ❌ 插件 ${name} 运行错误:`, error.message);
            }
            return;
        }

        try {
            // 插件的 stdout 应该是临时文件路径
            const outputPath = stdout.trim();
            if (!outputPath || !fs.existsSync(outputPath)) {
                logger.error(`[Scheduler] ❌ 插件 ${name} 未返回有效临时文件路径: ${outputPath}`);
                return;
            }

            // 读取临时文件内容
            const fileContent = fs.readFileSync(outputPath, 'utf-8');
            let nodes = JSON.parse(fileContent);
            if (!Array.isArray(nodes)) throw new Error('输出不是顶层 JSON 数组');

            const now = Date.now();

            logger.info(`[Scheduler] 📦 ${name} 成功获取 ${nodes.length} 个节点，正在写入...`);

            // 先用 Set 对本批次的 hash 进行内存去重
            const seenHashes = new Set();
            const deduped = [];

            for (const node of nodes) {
                if (!node || !node.protocol || !node.ip || !node.port) continue;

                const hash = computeHash(node.protocol, node.ip, node.port);

                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);

                const deletedCheck = statements.isDeleted.get(hash);
                if (deletedCheck) continue;

                const existing = statements.existsProxy.get(hash);
                if (existing) continue;

                deduped.push({
                    hash,
                    protocol: node.protocol,
                    ip: node.ip,
                    port: node.port,
                    shortName: node.shortName || 'Unknown',
                    longName: node.longName || 'Unknown',
                    remark: node.remark || name
                });
            }

            // 按优先级排序插入
            sortNodes(deduped);

            let addedCount = 0;
            for (const node of deduped) {
                try {
                    statements.insertOrUpdateReadyProxy.run({
                        ...node,
                        now
                    });
                    addedCount++;
                } catch(dbErr) {
                    logger.debug(`[Scheduler] 插入失败: ${node.hash} (${dbErr.message})`);
                }
            }

            logger.info(`[Scheduler] ✅ ${name} 导入完毕。有效写入: ${addedCount}, 批次内去重跳过: ${nodes.length - deduped.length}`);
            
            // 清理临时文件
            try {
                fs.unlinkSync(outputPath);
            } catch (e) {
                // 忽略删除失败
            }
            
        } catch(parseErr) {
            logger.error(`[Scheduler] ❌ 插件 ${name} 的输出解析失败:`, parseErr.message);
        }
    });
}

let pluginInterval = null;

export function initScheduler() {
    logger.info(`[Scheduler] 初始化调度器，插件执行间隔: ${config.pluginIntervalSeconds}秒`);

    // 立即执行一次所有启用的插件
    config.plugins.forEach(p => {
        if (p.enabled) {
            runPlugin(p);
        }
    });

    // 设置间隔执行
    pluginInterval = setInterval(() => {
        logger.info(`[Scheduler] 开始定时插件执行...`);
        config.plugins.forEach(p => {
            if (p.enabled) {
                runPlugin(p);
            }
        });
    }, config.pluginIntervalSeconds * 1000);
}

export function stopScheduler() {
    if (pluginInterval) clearInterval(pluginInterval);
}