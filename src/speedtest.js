import axios from 'axios';
import { logger, config } from './config.js';

/**
 * 测速模块：通过发起流式下载，在设定的时间内尽可能多地下载数据，计算其 Bps。
 * 为了防止爆内存且兼顾测速，设定流数据不在内存持有，仅计算读过的 chunks length 后抛弃。
 */
export async function testSpeed(proxyHost, proxyPort, protocol) {
  // Cloudflare 标准 10MB 测试文件
  const URL = 'http://speed.cloudflare.com/__down?bytes=10000000';
  const MAX_TIME_MS = config.runtime.speedtestTimeoutMs; 

  const proxyConfig = {
    host: proxyHost,
    port: proxyPort,
    protocol: protocol === 'https' ? 'https' : 'http'
  };

  const startTime = Date.now();
  let downloadedBytes = 0;

  try {
    const response = await axios({
      method: 'get',
      url: URL,
      proxy: proxyConfig,
      responseType: 'stream',
      timeout: MAX_TIME_MS, 
    });

    return new Promise((resolve) => {
      // 设置硬性超时掐爆阀门
      const timer = setTimeout(() => {
        response.data.destroy(); // 强行中断 Socket 流
        finishTest();
      }, MAX_TIME_MS);

      function finishTest() {
        clearTimeout(timer);
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs === 0) return resolve(0);
        // 计算 bytes per second
        const bps = Math.floor((downloadedBytes / elapsedMs) * 1000);
        resolve(bps);
      }

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        // 如果我们下完了整个文件（10MB）也可以提前退出
        if (downloadedBytes >= 10000000) {
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
