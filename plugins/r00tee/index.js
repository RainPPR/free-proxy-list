import axios from 'axios';
import { basename } from 'node:path';

/**
 * r00tee 插件
 * 目标：从 r00tee/Proxy-List 获取代理列表
 */

async function fetchFromEndpoint(url) {
  try {
    const protocol = basename(url).replace('.txt', '').toLowerCase();
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const port = parseInt(parts[1], 10);
        if (port > 0 && port <= 65535) {
          out.push({
            protocol,
            ip: parts[0],
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'r00tee'
          });
        }
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    'https://raw.githubusercontent.com/r00tee/Proxy-List/refs/heads/main/Https.txt',
    'https://raw.githubusercontent.com/r00tee/Proxy-List/refs/heads/main/Socks4.txt',
    'https://raw.githubusercontent.com/r00tee/Proxy-List/refs/heads/main/Socks5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
