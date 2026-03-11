import { logger } from './config.js';
import { closeDb } from './db.js';
import { initScheduler, stopScheduler } from './scheduler.js';
import { startValidatorEngine } from './validator.js';
import { initMaintenance, stopMaintenance } from './maintenance.js';
import { startServer } from './server.js';
import { initAuth } from './auth.js';

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

  // 4. 启动核心大循环引流管线 (永不 return)
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
