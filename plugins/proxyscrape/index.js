import axios from 'axios';



/**
 * ProxyScrape 高并发型接口提取器
 * 输出结果到临时文件，避免管道传输问题
 */

async function fetchFromEndpoint(protocol, url) {
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        let p = parseInt(parts[1], 10);
        if (p > 0 && p <= 65535) {
          out.push({
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
    return out;
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