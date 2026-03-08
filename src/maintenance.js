import { config, logger } from './config.js';
import { statements } from './db.js';

let maintenanceTimer = null;

// 从配置中拿来的两项阈值：重检限度 8h 和清空日志限度 24h
const { recheckIntervalMs, purgeDeletedLogsIntervalMs } = config.runtime;

export function initMaintenance() {
  logger.info(`[Maintenance] 服务已挂载，轮间检查开启。`);

  // 由于这不像高频发起的 Validator，这里设定每 1 小时 (3600000ms) 走一次强行清扫即可
  maintenanceTimer = setInterval(() => {
    runScheduledCleanups();
  }, 3600000); 

  // 但为了启动时即刻清理以前日积月累的，马上执行一次
  runScheduledCleanups();
}

function runScheduledCleanups() {
  logger.info(`[Maintenance] 🔧 开始周期性维保清洗...`);
  const now = Date.now();
  
  try {
    // 任务: 对于 24 小时前进入 deleted_logs 的数据，其惩罚期结束，予以硬删除
    const thresholdDate = now - purgeDeletedLogsIntervalMs;
    const result = statements.purgeOldDeletedLogs.run(thresholdDate);
    
    if (result.changes > 0) {
      logger.info(`[Maintenance] 🗑️ 剥除了 ${result.changes} 条越界的历史黑名单节点。`);
    } else {
      logger.debug(`[Maintenance] 🗑️ 没有超界的历史黑名单节点所需剥除。`);
    }
    
    // 至于“8 小时后复检”，我们交由 validator.js -> getOnePendingValidation 处理了
    // 只要 available / High-Performance 节点的 last_checked 超过 8 小时
    // 它就会自动被 SQL 吐出来并再次参与循环。
    // 因此这里无需编写额外逻辑将他们标记或拉取。

  } catch (err) {
    logger.error(`[Maintenance] 维保计划运行出错:`, err.message);
  }
}

export function stopMaintenance() {
  if (maintenanceTimer) clearInterval(maintenanceTimer);
}
