import { fetchText } from '../../utils/fetch-utils.js';



/**
 * ProxyScrape 高并发型接口提取器
 * 输出结果到临时文件，避免管道传输问题
 */

async function fetchFromEndpoint(protocol, url) {
  try {
    const text = await fetchText(url, { timeout: 15000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        let p = parseInt(parts[1], 10);
        if (p > 0 && p <= 65535) {
          proxies.push({
            protocol,
            ip: parts[0],
            port: p,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'proxyscrape'
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
    { p: 'http', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all' },
    { p: 'socks4', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all' },
    { p: 'socks5', u: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all' }
  ];

  let totalNodes = [];

  const promises = endpoints.map(e => fetchFromEndpoint(e.p, e.u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
