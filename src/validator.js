import net from 'node:net';
import axios from 'axios';
import { statements } from './db.js';
import { config, logger } from './config.js';
import { testSpeed } from './speedtest.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const {
  timeoutMs,
  maxRetries,
  highPerformanceMinBps,
  delayBetweenTestsMs,
  delayBetweenSpeedtestsMs,
  validationConcurrency,
  speedtestConcurrency
} = config.runtime;

// ============= 共享任务队列 =============
// 核心设计：一个调度器线程独占 DB 读取，分发到队列；多个 worker 从队列消费
// 这样就不会出现多个 worker 同时拿到同一个节点的问题

const validationQueue = [];    // 待验证队列
const speedtestQueue = [];     // 待测速队列
const processingSet = new Set(); // 正在被处理的 hash 集合（防重入）

// ============= 网络测试工具 =============

async function pingHost(host, port) {
  return new Promise((resolve) => {
    const sTime = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);

    sock.on('connect', () => { sock.destroy(); resolve(Date.now() - sTime); });
    sock.on('error', () => { sock.destroy(); resolve(-1); });
    sock.on('timeout', () => { sock.destroy(); resolve(-1); });

    sock.connect(port, host);
  });
}

async function measureHttpLatency(host, port, protocol, url) {
  const sTime = Date.now();
  try {
    await axios.get(url, {
      timeout: timeoutMs,
      proxy: { host, port, protocol },
      validateStatus: () => true
    });
    return Date.now() - sTime;
  } catch (err) {
    return -1;
  }
}

// ============= 单节点验证（不含测速） =============

async function validateProxy(proxyObj) {
  const { hash, ip, port, protocol, status } = proxyObj;
  let pLater = -1, gLater = -1, mLater = -1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    pLater = await pingHost(ip, port);
    if (pLater === -1 || pLater > 5000) {
      if (attempt < maxRetries) { await delay(100); continue; }
      else { handleFailedProxy(hash, "Ping 超时"); return; }
    }

    gLater = await measureHttpLatency(ip, port, protocol, 'http://www.google.com/generate_204');
    // MS 测试仅供参考，不参与有效性判断
    mLater = await measureHttpLatency(ip, port, protocol, 'http://www.msftconnecttest.com/connecttest.txt');

    // 判断有效性的唯一标准：Google 延迟 <= 5000ms
    if (gLater === -1 || gLater > 5000) {
      if (attempt < maxRetries) { await delay(200); continue; }
      else { handleFailedProxy(hash, "Google 测试失败"); return; }
    }
    break;
  }

  // 通过验证 → Available
  statements.updateProxyAsAvailable.run(Date.now(), pLater, gLater, mLater, hash);
  logger.info(`[Validator] ✅ ${ip}:${port} (P:${pLater} G:${gLater} M:${mLater})`);

  // 将此节点推入测速队列
  speedtestQueue.push(proxyObj);
}

// ============= 单节点测速 =============

async function speedtestProxy(proxyObj) {
  const { hash, ip, port, protocol, status } = proxyObj;
  
  const bps = await testSpeed(ip, port, protocol);
  if (bps > 0) {
    statements.updateProxySpeed.run(Date.now(), bps, bps, hash);
    if (bps >= highPerformanceMinBps) {
      logger.info(`[SpeedTest] 🚀 高性能! ${ip}:${port} ${(bps / 1024 / 1024).toFixed(2)} MB/s`);
    }
  }

  // 退化检查
  if (status === 2 && bps < 1048576) {
    statements.updateProxyAsAvailable.run(Date.now(), 0, 0, 0, hash);
    logger.info(`[SpeedTest] 💔 退化: ${ip}:${port}`);
  }
}

// ============= 失败处理 =============

function handleFailedProxy(hash, reason) {
  logger.debug(`[Validator] ✘ ${hash} (${reason})`);
  statements.insertDeleted.run(hash, Date.now());
  statements.deleteProxy.run(hash);
}

// ============= 调度器：从 DB 批量拉取任务填充队列 =============

function fillValidationQueue() {
  const nextDue = Date.now() - config.runtime.recheckIntervalMs;
  const batchSize = validationConcurrency * 2; // 拉取 2 倍并发数的任务做缓冲
  const rows = statements.getBatchPendingValidation.all(nextDue, batchSize);

  let added = 0;
  for (const row of rows) {
    // 跳过已在处理中的节点
    if (processingSet.has(row.hash)) continue;
    processingSet.add(row.hash);
    validationQueue.push(row);
    added++;
  }
  return added;
}

// ============= Worker: 验证消费者 =============

async function validationWorker(workerId) {
  while (true) {
    const job = validationQueue.shift();
    if (job) {
      try {
        await validateProxy(job);
      } catch (e) {
        logger.error(`[V-Worker-${workerId}] 异常: ${e.message}`);
      } finally {
        processingSet.delete(job.hash);
      }
      if (delayBetweenTestsMs > 0) await delay(delayBetweenTestsMs);
    } else {
      // 队列为空，等待调度器填充
      await delay(500);
    }
  }
}

// ============= Worker: 测速消费者 =============

async function speedtestWorker(workerId) {
  while (true) {
    const job = speedtestQueue.shift();
    if (job) {
      try {
        await speedtestProxy(job);
      } catch (e) {
        logger.error(`[S-Worker-${workerId}] 异常: ${e.message}`);
      }
      if (delayBetweenSpeedtestsMs > 0) await delay(delayBetweenSpeedtestsMs);
    } else {
      await delay(1000);
    }
  }
}

// ============= 调度器主循环 =============

async function dispatcherLoop() {
  while (true) {
    // 当验证队列不饱满时，从 DB 补充
    if (validationQueue.length < validationConcurrency) {
      const added = fillValidationQueue();
      if (added === 0) {
        // DB 中没有待处理的了，等一会儿
        await delay(3000);
      }
    } else {
      await delay(500);
    }
  }
}

// ============= 引擎启动入口 =============

export async function startValidatorEngine() {
  logger.info(`[Engine] 启动验证引擎 (验证并发: ${validationConcurrency}, 测速并发: ${speedtestConcurrency})`);

  const workers = [];

  // 调度器（唯一的 DB 读取者）
  workers.push(dispatcherLoop());

  // 验证 worker 池
  for (let i = 0; i < validationConcurrency; i++) {
    workers.push(validationWorker(i));
  }

  // 测速 worker 池
  for (let i = 0; i < speedtestConcurrency; i++) {
    workers.push(speedtestWorker(i));
  }

  await Promise.all(workers);
}