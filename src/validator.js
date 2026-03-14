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
const processingSet = new Set(); // 正在处理的哈希集合

// ============= 网络测试工具 =============

/**
 * 基础 TCP Ping
 */
async function pingHost(host, port) {
  return new Promise((resolve) => {
    const sTime = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs); // 使用配置的超时时间

    sock.on('connect', () => { sock.destroy(); resolve(Date.now() - sTime); });
    sock.on('error', () => { sock.destroy(); resolve(-1); });
    sock.on('timeout', () => { sock.destroy(); resolve(-1); });

    sock.connect(port, host);
  });
}

/**
 * 测量特定 URL 的 HTTP 延迟
 */
async function measureHttpLatency(host, port, protocol, url) {
  // 注意：此处不再进行内部重试，重试由外层 validateProxy 控制以节省资源
  const sTime = Date.now();
  const options = {
    timeout: timeoutMs,
    validateStatus: (status) => status >= 200 && status < 400,
    maxRedirects: 3
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
    return { success: false, latency: -1 };
  }
}

// ============= 区域验证策略 =============

const STRATEGIES = {
  global: {
    validate: (g, m, h) => g > 0 && g <= timeoutMs,
    speedtestUrl: 'http://speed.cloudflare.com/__down?bytes=10000000'
  },
  cn: {
    validate: (g, m, h) => g === -1 && m > 0 && m <= timeoutMs && h > 0 && h <= timeoutMs,
    speedtestUrl: 'https://dldir1v6.qq.com/weixin/Universal/Windows/WeChatWin_4.1.7.exe'
  }
};

// ============= 单节点业务逻辑 =============

async function validateProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  
  // 1. Ping 测试
  let pLater = await pingHost(ip, port);
  if (pLater === -1) {
    handleFailedProxy(hash, "Ping Failed", region);
    return;
  }

  // 2. 多点 HTTP 验证
  const [gRes, mRes, hRes] = await Promise.all([
    measureHttpLatency(ip, port, protocol, 'https://www.google.com/generate_204'),
    measureHttpLatency(ip, port, protocol, 'http://www.microsoft.com/pki/mscorp/cps'),
    measureHttpLatency(ip, port, protocol, 'http://connectivitycheck.platform.hicloud.com/generate_204')
  ]);

  const strategy = STRATEGIES[region] || STRATEGIES.global;
  const success = strategy.validate(gRes.latency, mRes.latency, hRes.latency);

  if (!success) {
    handleFailedProxy(hash, `Failed Quality (G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`, region);
    return;
  }

  // 3. 结果入库并进入测速队列
  statements.updateProxyAsAvailable.run(Date.now(), pLater, gRes.latency, mRes.latency, hRes.latency, hash, region);
  logger.info(`[Validator] ✅ [${region.toUpperCase()}] ${ip}:${port} (P:${pLater} G:${gRes.latency} M:${mRes.latency} H:${hRes.latency})`);

  speedtestQueue.push(proxyObj);
}

async function speedtestProxy(proxyObj) {
  const { hash, ip, port, protocol, region = 'global' } = proxyObj;
  const strategy = STRATEGIES[region] || STRATEGIES.global;
  
  const bps = await testSpeed(ip, port, protocol, strategy.speedtestUrl);
  if (bps > 0) {
    statements.updateProxySpeed.run(Date.now(), bps, bps, bps, hash, region);
    if (bps >= highPerformanceMinBps) {
      logger.info(`[SpeedTest] 🚀 [${region.toUpperCase()}] HighPerf! ${ip}:${port} ${(bps / 1024 / 1024).toFixed(2)} MB/s`);
    }
  }
}

function handleFailedProxy(hash, reason, region = 'global') {
  logger.debug(`[Validator] ✘ [${region.toUpperCase()}] ${hash} (${reason})`);
  statements.insertDeleted.run(hash, Date.now(), region);
  statements.deleteProxy.run(hash, region);
}

// ============= 队列管理 =============

function fillValidationQueue() {
  const nextDue = Date.now() - config.runtime.recheckIntervalMs;
  // 1024MB 环境下，单次拉取数量不宜过多，保持在并发数的 2-3 倍即可
  const batchSize = Math.max(validationConcurrency * 2, 20); 
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
    const job = validationQueue.shift();
    if (job) {
      try {
        await validateProxy(job);
      } catch (e) {
        logger.error(`[V-Worker-${workerId}] Exception: ${e.message}`);
      } finally {
        processingSet.delete(job.hash);
      }
      if (delayBetweenTestsMs > 0) await delay(delayBetweenTestsMs);
    } else {
      await delay(2000); // 无任务时休眠长一点，减少对 1024MB RAM 的 CPU 压力
    }
  }
}

async function speedtestWorker(workerId) {
  while (true) {
    const job = speedtestQueue.shift();
    if (job) {
      try {
        await speedtestProxy(job);
      } catch (e) {
        logger.error(`[S-Worker-${workerId}] Exception: ${e.message}`);
      }
      if (delayBetweenSpeedtestsMs > 0) await delay(delayBetweenSpeedtestsMs);
    } else {
      await delay(5000);
    }
  }
}

async function dispatcherLoop() {
  logger.info(`[Dispatcher] Starting...`);
  while (true) {
    try {
      // 队列余量不足一半时补充
      if (validationQueue.length < validationConcurrency) {
        const added = fillValidationQueue();
        if (added === 0 && validationQueue.length === 0) {
          await delay(15000); // 全部验证完后，等待更久再检查
        } else {
          await delay(3000);
        }
      } else {
        await delay(2000);
      }
    } catch (err) {
      logger.error(`[Dispatcher] Error: ${err.message}`);
      await delay(10000);
    }
  }
}

export async function startValidatorEngine() {
  logger.info(`[Engine] Running (P-Set: ${validationConcurrency}V / ${speedtestConcurrency}S)`);
  
  const workers = [dispatcherLoop()];
  for (let i = 0; i < validationConcurrency; i++) workers.push(validationWorker(i));
  for (let i = 0; i < speedtestConcurrency; i++) workers.push(speedtestWorker(i));
  
  await Promise.all(workers);
}