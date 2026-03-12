import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { logger, config } from './config.js';

/**
 * 测速模块：通过发起流式下载，在设定的时间内尽可能多地下载数据，计算其 Bps。
 * 为了防止爆内存且兼顾测速，设定流数据不在内存持有，仅计算读过的 chunks length 后抛弃。
 */
export async function testSpeed(proxyHost, proxyPort, protocol, targetUrl) {
  // 默认使用 Cloudflare 标准 10MB 测试文件，支持传入自定义 URL (如微信安装包)
  const URL = targetUrl || 'http://speed.cloudflare.com/__down?bytes=10000000';
  const MAX_TIME_MS = config.runtime.speedtestTimeoutMs; 
  const EXPECTED_BYTES = URL.includes('bytes=') ? parseInt(URL.split('bytes=')[1]) : 250 * 1024 * 1024;

  const startTime = Date.now();
  let downloadedBytes = 0;

  const options = {
    method: 'get',
    url: URL,
    responseType: 'stream',
    timeout: MAX_TIME_MS,
  };

  if (protocol.startsWith('socks')) {
    const agent = new SocksProxyAgent(`${protocol}://${proxyHost}:${proxyPort}`);
    options.httpAgent = agent;
    options.httpsAgent = agent;
  } else {
    options.proxy = {
      host: proxyHost,
      port: proxyPort,
      protocol: protocol === 'https' ? 'https' : 'http'
    };
  }

  try {
    const response = await axios(options);

    return new Promise((resolve) => {
      let isFinished = false;

      // 设置硬性超时掐爆阀门
      const timer = setTimeout(() => {
        response.data.destroy(); // 强行中断 Socket 流
        finishTest();
      }, MAX_TIME_MS);

      function finishTest() {
        if (isFinished) return;
        isFinished = true;
        
        clearTimeout(timer);
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs === 0) return resolve(0);
        // 计算 bytes per second
        const bps = Math.floor((downloadedBytes / elapsedMs) * 1000);
        resolve(bps);
      }

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        // 如果我们下完了整个文件也可以提前退出
        if (downloadedBytes >= EXPECTED_BYTES) {
          response.data.destroy();
          finishTest();
        }
      });

      response.data.on('end', finishTest);

      response.data.on('error', () => {
        finishTest();
      });
    });

  } catch (error) {
    // 代理无法连接或超时，bps 为 0
    return 0;
  }
}
