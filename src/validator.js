import { statements } from './db.js';
import { config, logger, globalState } from './config.js';
import { testSpeed } from './speedtest.js';
import net from 'net';

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
 * 基础 TCP Ping - 使用Node.js net模块
 */
async function pingHost(host, port) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(-1);
      }
    }, timeoutMs);
    
    const socket = new net.Socket();
    
    socket.connect(port, host, () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        socket.destroy();
        resolve(Date.now() - startTime);
      }
    });
    
    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        socket.destroy();
        resolve(-1);
      }
    });
    
    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(-1);
      }
    });
  });
}

/**
 * 测量特定 URL 的 HTTP 延迟（使用 Bun.fetch）
 */
async function measureHttpLatency(host, port, protocol, url) {
  const sTime = Date.now();
  
  // 处理SOCKS代理：需要使用socks-proxy-agent
  if (protocol.startsWith('socks')) {
    // 动态导入socks-proxy-agent以避免在没有SOCKS代理时加载
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    const agent = new SocksProxyAgent(`${protocol}://${host}:${port}`);
    
    // 对于SOCKS代理，暂时保留axios方案，因为Bun.fetch不支持SOCKS
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(url, {
        timeout: timeoutMs,
        httpAgent: agent,
        httpsAgent: agent,
        validateStatus: (status) => status >= 200 && status < 400,
        maxRedirects: 3
      });
      return { success: true, latency: Date.now() - sTime };
    } catch (err) {
      return { success: false, latency: -1 };
    }
  } else {
    // HTTP/HTTPS代理：使用Bun.fetch
    const proxyUrl = `${protocol}://${host}:${port}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await Bun.fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Bun' },
        redirect: 'follow',
        maxRedirections: 3,
        proxy: proxyUrl,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return { success: false, latency: -1 };
      }
      
      // 读取body以确保完整响应
      await response.text();
      return { success: true, latency: Date.now() - sTime };
    } catch (err) {
      return { success: false, latency: -1 };
    }
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
    statements.updateProxySpeed.run(Date.now(), bps, bps, config.runtime.highPerformanceMinBps, bps, config.runtime.highPerformanceMinBps, hash, region);
    const speedMB = (bps / 1024 / 1024).toFixed(2);
    const isHighPerf = bps >= highPerformanceMinBps;
    logger.info(`[SpeedTest] ✅ [${region.toUpperCase()}] ${ip}:${port} ${speedMB} MB/s${isHighPerf ? ' [HighPerf]' : ''}`);
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
      await delay(2000);
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
      if (globalState.enginePaused) {
        await delay(5000);
        continue;
      }
      if (validationQueue.length < validationConcurrency) {
        const added = fillValidationQueue();
        if (added === 0 && validationQueue.length === 0) {
          await delay(15000);
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
  
  // 定期执行全量 GC，防止在大批量测试时内存积压
  setInterval(() => {
    if (typeof Bun !== 'undefined' && Bun.gc) {
      Bun.gc(true);
    }
  }, 120000); // 每 2 分钟回收一次

  const workers = [dispatcherLoop()];
  for (let i = 0; i < validationConcurrency; i++) workers.push(validationWorker(i));
  for (let i = 0; i < speedtestConcurrency; i++) workers.push(speedtestWorker(i));
  
  await Promise.all(workers);
}