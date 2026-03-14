import axios from 'axios';
import { basename } from 'node:path';


/**
 * roosterkid-cn 插件
 * 目标：仅筛选国家代码为 CN 的节点
 */

async function fetchFromEndpoint(url) {
  try {
    const protocol = basename(url).replace('.txt', '').toLowerCase();
    const res = await axios.get(url, { responseType: 'text', timeout: 20000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('SOCKS') || trimmed.includes('BTC')) continue;

      const parts = trimmed.split(/\s+/);
      let ipPort = '';
      let isCN = false;

      for (const part of parts) {
        if (part.includes(':') && part.split(':').length === 2 && /^\d/.test(part)) {
          ipPort = part;
        } else if (part === 'CN') {
          isCN = true;
        }
      }

      if (ipPort && isCN) {
        const [ip, port] = ipPort.split(':');
        out.push({
          protocol,
          ip,
          port: parseInt(port, 10),
          shortName: 'CN',
          longName: 'China',
          remark: 'roosterkid-cn'
        });
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/HTTPS.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/SOCKS4.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/SOCKS5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}

