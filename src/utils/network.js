/**
 * 网络工具函数
 * 封装测速和延迟检测，方便在不同运行时间迁移
 * 兼容 Bun 和 Node.js
 */

import net from 'net';
import { fetchText } from './fetch-utils.js';

/**
 * TCP连接测试（使用Node.js net模块，兼容Bun）
 * @param {string} host - 主机地址
 * @param {number} port - 端口
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<number>} - 返回延迟（毫秒），失败返回-1
 */
export async function tcpPing(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(-1);
      }
    }, timeout);
    
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
        resolve(-1);
      }
    });
  });
}

/**
 * HTTP HEAD请求测延迟
 * @param {string} url - URL
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<number>} - 返回延迟（毫秒），失败返回-1
 */
export async function httpPing(url, timeout = 5000) {
  try {
    const startTime = Date.now();
    await fetchText(url, { 
      timeout, 
      method: 'HEAD',
      headers: { 'Cache-Control': 'no-cache' }
    });
    return Date.now() - startTime;
  } catch (error) {
    return -1;
  }
}

/**
 * 下载测速
 * @param {string} url - 测试文件URL
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{speed: number, duration: number}>} - 速度(bps)和耗时(ms)
 */
export async function downloadSpeed(url, timeout = 10000) {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout)
    });
    
    let bytes = 0;
    const reader = response.body?.getReader();
    
    if (!reader) {
      // 如果没有流，直接获取整个响应
      const text = await response.text();
      bytes = Buffer.byteLength(text);
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
      }
    }
    
    const duration = Date.now() - startTime;
    const speed = (bytes * 8) / (duration / 1000); // bits per second
    
    return { speed, duration };
  } catch (error) {
    return { speed: -1, duration: -1 };
  }
}

/**
 * Google延迟测试
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<number>} - 返回延迟（毫秒），失败返回-1
 */
export async function googleLatency(timeout = 5000) {
  return httpPing('https://www.google.com/generate_204', timeout);
}

/**
 * Cloudflare延迟测试
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<number>} - 返回延迟（毫秒），失败返回-1
 */
export async function cloudflareLatency(timeout = 5000) {
  return httpPing('https://cloudflare.com/cdn-cgi/trace', timeout);
}

/**
 * 并行延迟测试（测试多个目标）
 * @param {Array<{host: string, port: number, url?: string}>} targets - 测试目标
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Array<{host: string, port?: number, latency: number}>>} - 测试结果
 */
export async function parallelLatencyTest(targets, timeout = 5000) {
  const promises = targets.map(async (target) => {
    let latency;
    if (target.url) {
      latency = await httpPing(target.url, timeout);
    } else {
      latency = await tcpPing(target.host, target.port, timeout);
    }
    return { host: target.host, port: target.port, latency };
  });
  
  return Promise.all(promises);
}

/**
 * 获取代理的响应延迟（通过HTTP CONNECT）
 * @param {string} proxyHost - 代理主机
 * @param {number} proxyPort - 代理端口
 * @param {string} targetHost - 目标主机
 * @param {number} targetPort - 目标端口
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<number>} - 返回延迟（毫秒），失败返回-1
 */
export async function proxyLatency(proxyHost, proxyPort, targetHost = 'www.google.com', targetPort = 443, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(-1);
      }
    }, timeout);
    
    const socket = new net.Socket();
    
    socket.connect(proxyPort, proxyHost, () => {
      // 发送HTTP CONNECT请求
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
      
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\r\n\r\n')) {
          // 检查响应
          if (data.startsWith('HTTP/1.1 200') || data.startsWith('HTTP/1.0 200')) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              socket.destroy();
              resolve(Date.now() - startTime);
            }
          } else {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              resolve(-1);
            }
          }
        }
      });
    });
    
    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve(-1);
      }
    });
  });
}
