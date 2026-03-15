import { fetchText } from '../../utils/fetch-utils.js';
;

/**
 * thespeedx 插件
 * 目标：从 TheSpeedX GitHub 仓库获取代理列表
 * 格式：ip:port
 * 要求：协议从文件名中获取（没有 https）
 */

async function fetchFromEndpoint(url) {
  try {
    const protocol = basename(url).replace('.txt', '').toLowerCase();
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
            remark: 'thespeedx'
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
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/refs/heads/master/http.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/refs/heads/master/socks4.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/refs/heads/master/socks5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
