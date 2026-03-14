import axios from 'axios';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import fs from 'node:fs';

/**
 * thespeedx 插件
 * 目标：从 TheSpeedX GitHub 仓库获取代理列表
 * 格式：ip:port
 * 要求：协议从文件名中获取（没有 https）
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
            remark: 'thespeedx'
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

  // 写入临时文件
  const outputPath = join(tmpdir(), `thespeedx-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  // 输出文件路径到 stdout
  console.log(outputPath);
  process.exit(0);
}

run();
