import net from 'node:net';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
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
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const sTime = Date.now();
    const options = {
      timeout: timeoutMs,
      // 放宽状态码判定：2xx 到 3xx 均视为通畅
      validateStatus: (status) => status >= 200 && status < 400,
      maxRedirects: 5
    };

    if (protocol.startsWith('socks')) {
      const agent = new SocksProxyAgent(`${protocol}://${host}:${port}`);
      options.httpAgent = agent;
      options.httpsAgent = agent;
    } else {
      options.proxy = { host, port, protocol: protocol === 'https' ? 'https' : 'http' };
    }

    try {
      await axios.get(url, options);
      return { success: true, latency: Date.now() - sTime };
    } catch (err) {
      if (attempt < maxRetries) {
        await delay(200);
      } else {
        return { success: false, latency: -1 };
      }
    }
  }
}

// ============= 区域验证策略 =============

const STRATEGIES = {
  global: {
    // 全球节点：Google 和 Microsoft 必须都成功
    validate: (g, m, h) => g > 0 && g <= 5000 && m > 0 && m <= 5000,
    speedtestUrl: 'http://speed.cloudflare.com/__down?bytes=10000000'
  },
  cn: {
    // 中国节点：Google 必须失败，且 Microsoft 和 Hicmatch (Huawei) 必须成功
    validate: (g, m, h) => g === -1 && m > 0 && m <= 5000 && h > 0 && h <= 5000,
    speedtestUrl: 'https://dldir1v6.qq.com/weixin/Universal/Windows/WeChatWin_4.1.7.exe'
  }
};

// ============= 单节点验证（不含测速） =============

async function validateProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  let pLater = -1; // Ping latency

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    pLater = await pingHost(ip, port);
    if (pLater !== -1 && pLater <= 5000) break;
    if (attempt < maxRetries) await delay(100);
  }

  if (pLater === -1 || pLater > 5000) {
    handleFailedProxy(hash, "Ping 超时", region);
    return;
  }

  // 核心逻辑：无论哪个区域，都先跑全量测试，measureHttpLatency 本身带有重试
  const [gRes, mRes, hRes] = await Promise.all([
    measureHttpLatency(ip, port, protocol, 'https://www.google.com/generate_204'),
    measureHttpLatency(ip, port, protocol, 'http://www.microsoft.com/pki/mscorp/cps'),
    measureHttpLatency(ip, port, protocol, 'http://connectivitycheck.platform.hicloud.com/generate_204')
  ]);

  const strategy = STRATEGIES[region] || STRATEGIES.global;
  const success = strategy.validate(gRes.latency, mRes.latency, hRes.latency);

  if (!success) {
    handleFailedProxy(hash, `策略验证失败: 质量未达标 (G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`, region);
    return;
  }

  // 验证通过，记录数据
  statements.updateProxyAsAvailable.run(
      Date.now(), 
      pLater, 
      gRes.latency, 
      mRes.latency, 
      hRes.latency, 
      hash, 
      region
  );
  logger.info(`[Validator] ✅ [${region.toUpperCase()}] ${ip}:${port} (P:${pLater} G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`);

  // 将此节点推入测速队列
  speedtestQueue.push(proxyObj);
}

// ============= 单节点测速 =============

async function speedtestProxy(proxyObj) {
  const { hash, ip, port, protocol, status, region = 'global' } = proxyObj;
  const strategy = STRATEGIES[region] || STRATEGIES.global;
  
  const bps = await testSpeed(ip, port, protocol, strategy.speedtestUrl);
  if (bps > 0) {
    // The query requires 6 parameters: time, bps(set), bps(check 1), bps(check 2), hash, region
    statements.updateProxySpeed.run(Date.now(), bps, bps, bps, hash, region);
    if (bps >= highPerformanceMinBps) {
      logger.info(`[SpeedTest] 🚀 [${region.toUpperCase()}] 高性能! ${ip}:${port} ${(bps / 1024 / 1024).toFixed(2)} MB/s`);
    } else if (status === 2 && bps < 1048576) {
      logger.info(`[SpeedTest] 💔 [${region.toUpperCase()}] 退化: ${ip}:${port}`);
    }
  }
}

// ============= 失败处理 =============

function handleFailedProxy(hash, reason, region = 'global') {
  logger.debug(`[Validator] ✘ [${region.toUpperCase()}] ${hash} (${reason})`);
  statements.insertDeleted.run(hash, Date.now(), region);
  statements.deleteProxy.run(hash, region);
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