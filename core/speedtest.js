import { logger, config } from './config.js';

/**
 * 测速模块：使用Bun.fetch流式下载数据，计算下载速度（Bps）
 */
export async function testSpeed(proxyHost, proxyPort, protocol, targetUrl) {
  const URL = targetUrl || 'http://speed.cloudflare.com/__down?bytes=10000000';
  const MAX_TIME_MS = config.runtime.speedtestTimeoutMs;

  const startTime = Date.now();
  let downloadedBytes = 0;

  // 处理SOCKS代理：需要使用socks-proxy-agent
  if (protocol.startsWith('socks')) {
    // 对于SOCKS代理，暂时使用动态导入axios的方案
    try {
      const { default: axios } = await import('axios');
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      const agent = new SocksProxyAgent(`${protocol}://${proxyHost}:${proxyPort}`);
      
      const options = {
        method: 'get',
        url: URL,
        responseType: 'stream',
        timeout: MAX_TIME_MS,
        httpAgent: agent,
        httpsAgent: agent,
      };

      const response = await axios(options);

      return new Promise((resolve) => {
        let isFinished = false;

        const timer = setTimeout(() => {
          response.data.destroy();
          finishTest();
        }, MAX_TIME_MS);

        function finishTest() {
          if (isFinished) return;
          isFinished = true;
          
          clearTimeout(timer);
          const elapsedMs = Date.now() - startTime;
          if (elapsedMs === 0) return resolve(0);
          const bps = Math.floor((downloadedBytes / elapsedMs) * 1000);
          resolve(bps);
        }

        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
        });

        response.data.on('end', finishTest);
        response.data.on('error', finishTest);
      });

    } catch (error) {
      return 0;
    }
  } else {
    // HTTP/HTTPS代理：使用Bun.fetch
    const proxyUrl = `${protocol}://${proxyHost}:${proxyPort}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAX_TIME_MS);
      
      const response = await Bun.fetch(URL, {
        method: 'GET',
        proxy: proxyUrl,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        clearTimeout(timeoutId);
        return 0;
      }
      
      // 流式读取响应
      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeoutId);
        return 0;
      }
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || Date.now() - startTime >= MAX_TIME_MS) {
            break;
          }
          if (value) {
            downloadedBytes += value.length;
          }
        }
      } catch (error) {
        // 读取过程中出错
      } finally {
        reader.cancel().catch(() => {});
        clearTimeout(timeoutId);
      }
      
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs === 0) return 0;
      return Math.floor((downloadedBytes / elapsedMs) * 1000);
      
    } catch (error) {
      return 0;
    }
  }
}