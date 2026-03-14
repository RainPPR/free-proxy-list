import axios from 'axios';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import fs from 'node:fs';

/**
 * proxyspace 插件
 * 目标：从 proxyspace.pro 获取代理列表
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
            remark: 'proxyspace'
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

  // 写入临时文件
  const outputPath = join(tmpdir(), `proxyspace-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  // 输出文件路径到 stdout
  console.log(outputPath);
  process.exit(0);
}

run();
