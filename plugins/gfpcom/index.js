import axios from 'axios';
import { URL } from 'node:url';

/**
 * gfpcom 插件
 * 目标：从 gfpcom wiki 获取代理列表
 * 格式：protocol://ip:port 或 protocol://user:pass@ip:port
 * 
 * 性能优化点：
 * 1. 统一内部变量名为 proxies。
 * 2. 完善 URL 解析对带验证节点的过滤逻辑。
 */

/**
 * 从单个端点获取数据并解析
 * @param {string} url 
 */
async function fetchFromEndpoint(url) {
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const lines = res.data.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const parsed = new URL(trimmed);
        if (parsed.username || parsed.password) {
          // 忽略带验证的节点
          continue;
        }

        const protocol = parsed.protocol.replace(':', '');
        const ip = parsed.hostname;
        const port = parseInt(parsed.port, 10);

        if (ip && port > 0 && port <= 65535) {
          proxies.push({
            protocol,
            ip,
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'gfpcom'
          });
        }
      } catch (e) {
        continue;
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}

/**
 * 插件入口
 */
export default async function fetch() {
  const endpoints = [
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/http.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/https.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/socks4.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/socks5.txt'
  ];

  try {
    const resultsArr = await Promise.all(endpoints.map(u => fetchFromEndpoint(u)));
    const proxies = resultsArr.flat();
    return proxies;
  } catch (err) {
    return [];
  }
}
