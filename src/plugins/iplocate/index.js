import { fetchText } from '../../utils/fetch-utils.js';

/**
 * iplocate 插件
 * 目标：从 iplocate 获取代理列表
 * 格式：protocol://ip:port
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/iplocate/free-proxy-list/refs/heads/main/all-proxies.txt';
  
  try {
    const text = await fetchText(url, { timeout: 20000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配格式：protocol://ip:port
      const parts = trimmed.split('://');
      if (parts.length === 2) {
        const protocol = parts[0].toLowerCase();
        const address = parts[1].split(':');
        if (address.length === 2) {
          const ip = address[0];
          const port = parseInt(address[1], 10);

          if (ip && port > 0 && port <= 65535) {
            proxies.push({
              protocol: protocol,
              ip: ip,
              port: port,
              shortName: 'Unknown',
              longName: 'Unknown',
              remark: 'iplocate'
            });
          }
        }
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
