import { fetchText } from '../../utils/fetch-utils.js';
;

/**
 * proxyspace 插件
 * 目标：从 proxyspace.pro 获取代理列表
 */

async function fetchFromEndpoint(url) {
  try {
    const protocol = url.split('/').pop().replace('.txt', '').toLowerCase();
    const text = await fetchText(url, { timeout: 15000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const port = parseInt(parts[1], 10);
        if (port > 0 && port <= 65535) {
          proxies.push({
            protocol,
            ip: parts[0],
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'proxyspace'
          });
        }
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    'https://proxyspace.pro/http.txt',
    'https://proxyspace.pro/https.txt',
    'https://proxyspace.pro/socks4.txt',
    'https://proxyspace.pro/socks5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
