import { logger } from '../../config.js';

let worker = null;
let resolverQueue = [];

// 保证 Worker 是单例且仅在需要时初始化
function initWorker() {
  if (worker) return;
  try {
    // 实例化独立服务 (Worker)
    worker = new Worker(new URL('../../proxypool/worker.js', import.meta.url));
    
    worker.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'PROXY_DATA') {
        logger.info(`[Proxypool Plugin] 从独立服务接收到了 ${data.length} 个最新代理节点。`);
        // 完成所有由于并发或连续调用等待的主进程Promise
        while (resolverQueue.length > 0) {
          const resolve = resolverQueue.shift();
          resolve(data);
        }
      }
    };
    
    worker.onerror = (err) => {
      logger.error(`[Proxypool Plugin] 独立服务抛出异常: ${err.message}`);
    };
  } catch (err) {
    logger.error(`[Proxypool Plugin] 无法初始化 Worker: ${err.message}`);
  }
}

/**
 * Proxypool 插件的默认导出函数
 * 这个函数只会返回该独立服务在后台缓存的代理源
 */
export default async function () {
  initWorker();
  if (!worker) return [];

  return new Promise((resolve) => {
    resolverQueue.push(resolve);
    // 通知 Worker 把目前收集到的代理数组交出来
    worker.postMessage({ type: 'GET' });
  });
}
