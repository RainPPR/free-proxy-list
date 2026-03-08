import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

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

async function run() {
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

  // 写入临时文件
  const outputPath = join(tmpdir(), `proxyscrape-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  // 输出文件路径到 stdout
  console.log(outputPath);
  process.exit(0);
}

run();