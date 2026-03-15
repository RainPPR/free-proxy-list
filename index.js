import { logger } from './core/config.js';
import { closeDb, reclassifyHighPerformanceNodes } from './core/db.js';
import { initScheduler, stopScheduler } from './core/scheduler.js';
import { startValidatorEngine } from './core/validator.js';
import { initMaintenance, stopMaintenance } from './core/maintenance.js';
import { startServer } from './server/server.js';
import { initAuth } from './core/auth.js';

let serverHandle = null;

async function bootstrap() {
  logger.info(`[System] ====== Free Proxy List 启动 ======`);
  
  // 0. 初始化管理凭据
  initAuth();

  // 1. 启动 HTTP 和 Dashboard API
  serverHandle = startServer();

  // 2. 挂载 Cron 插件爬虫调度器
  initScheduler();

  // 3. 挂载过期/软删除节点的清理机制
  initMaintenance();

  // 4. 重新分类高性能节点（根据当前配置的 highPerformanceMinBps 标准）
  // 扫描所有区域（global 和 cn）的 status=2 节点，检查速度是否达标
  // 这样当用户修改了高性能标准后，重启系统会自动重新调整节点分类
  try {
    const result = reclassifyHighPerformanceNodes(); // 不传参数，处理所有区域
    logger.info(`[System] 高性能节点重分类完成: 总计 ${result.total}，保持 ${result.kept}，降级 ${result.demoted}`);
  } catch (err) {
    logger.error(`[System] 高性能节点重分类失败: ${err.message}`);
  }

  // 5. 启动核心大循环引流管线 (永不 return)
  startValidatorEngine();
}

// 优雅关机信号捕获 (防止 Sqlite 没刷写导致坏库)
function gracefulShutdown(signal) {
  logger.info(`\n[System] 收到退出信号: ${signal}，正在执行优雅停机...`);
  
  try {
    stopScheduler();
    stopMaintenance();
    if (serverHandle) serverHandle.close();
    
    // SQLite 内存/WAL刷写同步关闭
    closeDb();
    
    logger.info(`[System] 停机流程完毕，再见！`);
    process.exit(0);
  } catch (err) {
    logger.error(`[System] 停机时出现错误: ${err.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 处理可能被遗漏的在 Promise 中的错
process.on('unhandledRejection', (reason, p) => {
  logger.error('[System] ❌ 未捕获的 Promise 异常:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[System] ❌ 致命错误:', err.message);
  gracefulShutdown('uncaughtException');
});

// Go
bootstrap();