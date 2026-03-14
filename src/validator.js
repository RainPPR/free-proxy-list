import net from 'node:net';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { statements } from './db.js';
import { config, logger, globalState } from './config.js';
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
const validationQueue = [];    // 待验证队列
const speedtestQueue = [];     // 待测速队列
const processingSet = new Set(); // 正在被处理的 hash 集合（防重入）

// ============= 网络测试工具 =============

async function pingHost(host, port) {
  return new Promise((resolve) => {
    const sTime = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(2000);

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
    validate: (g, m, h) => g > 0 && g <= 5000,
    speedtestUrl: 'http://speed.cloudflare.com/__down?bytes=10000000'
  },
  cn: {
    validate: (g, m, h) => g === -1 && m > 0 && m <= 5000 && h > 0 && h <= 5000,
    speedtestUrl: 'https://dldir1v6.qq.com/weixin/Universal/Windows/WeChatWin_4.1.7.exe'
  }
};

// ============= 单节点验证 =============

async function validateProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  let pLater = -1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    pLater = await pingHost(ip, port);
    if (pLater !== -1 && pLater <= 5000) break;
    if (attempt < maxRetries) await delay(100);
  }

  if (pLater === -1 || pLater > 5000) {
    handleFailedProxy(hash, "Ping 超时", region);
    return;
  }

  const [gRes, mRes, hRes] = await Promise.all([
    measureHttpLatency(ip, port, protocol, 'https://www.google.com/generate_204'),
    measureHttpLatency(ip, port, protocol, 'http://www.microsoft.com/pki/mscorp/cps'),
    measureHttpLatency(ip, port, protocol, 'http://connectivitycheck.platform.hicloud.com/generate_204')
  ]);

  const strategy = STRATEGIES[region] || STRATEGIES.global;
  const success = strategy.validate(gRes.latency, mRes.latency, hRes.latency);

  if (!success) {
    handleFailedProxy(hash, `质量未达标 (G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`, region);
    return;
  }

  statements.updateProxyAsAvailable.run(Date.now(), pLater, gRes.latency, mRes.latency, hRes.latency, hash, region);
  logger.info(`[Validator] ✅ [${region.toUpperCase()}] ${ip}:${port} (P:${pLater} G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`);

  speedtestQueue.push(proxyObj);
}

// ============= 单节点测速 =============

async function speedtestProxy(proxyObj) {
  const { hash, ip, port, protocol, status, region = 'global' } = proxyObj;
  const strategy = STRATEGIES[region] || STRATEGIES.global;
  
  const bps = await testSpeed(ip, port, protocol, strategy.speedtestUrl);
  if (bps > 0) {
    statements.updateProxySpeed.run(Date.now(), bps, bps, bps, hash, region);
    if (bps >= highPerformanceMinBps) {
      logger.info(`[SpeedTest] 🚀 [${region.toUpperCase()}] 高性能! ${ip}:${port} ${(bps / 1024 / 1024).toFixed(2)} MB/s`);
    }
  }
}

// ============= 辅助方法 =============

function handleFailedProxy(hash, reason, region = 'global') {
  logger.debug(`[Validator] ✘ [${region.toUpperCase()}] ${hash} (${reason})`);
  statements.insertDeleted.run(hash, Date.now(), region);
  statements.deleteProxy.run(hash, region);
}

function fillValidationQueue() {
  const nextDue = Date.now() - config.runtime.recheckIntervalMs;
  const batchSize = Math.max(validationConcurrency * 3, 50); 
  const rows = statements.getBatchPendingValidation.all(nextDue, batchSize);

  let added = 0;
  for (const row of rows) {
    if (processingSet.has(row.hash)) continue;
    processingSet.add(row.hash);
    validationQueue.push(row);
    added++;
  }
  return added;
}

// ============= Workers =============

async function validationWorker(workerId) {
  while (true) {
    if (globalState.isPluginRunning) {
      await delay(5000);
      continue;
    }

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
      await delay(1000);
    }
  }
}

async function speedtestWorker(workerId) {
  while (true) {
    if (globalState.isPluginRunning) {
      await delay(5000);
      continue;
    }

    const job = speedtestQueue.shift();
    if (job) {
      try {
        await speedtestProxy(job);
      } catch (e) {
        logger.error(`[S-Worker-${workerId}] 异常: ${e.message}`);
      }
      if (delayBetweenSpeedtestsMs > 0) await delay(delayBetweenSpeedtestsMs);
    } else {
      await delay(2000);
    }
  }
}

async function dispatcherLoop() {
  logger.info(`[Dispatcher] 启动...`);
  while (true) {
    try {
      if (validationQueue.length < Math.floor(validationConcurrency / 2) + 1) {
        const added = fillValidationQueue();
        if (added === 0 && validationQueue.length === 0) {
          await delay(10000);
        } else {
          await delay(2000);
        }
      } else {
        await delay(1000);
      }
    } catch (err) {
      logger.error(`[Dispatcher] 异常: ${err.message}`);
      await delay(5000);
    }
  }
}

export async function startValidatorEngine() {
  logger.info(`[Engine] 启动 (并发 V:${validationConcurrency} S:${speedtestConcurrency})`);
  const workers = [dispatcherLoop()];
  for (let i = 0; i < validationConcurrency; i++) workers.push(validationWorker(i));
  for (let i = 0; i < speedtestConcurrency; i++) workers.push(speedtestWorker(i));
  await Promise.all(workers);
}