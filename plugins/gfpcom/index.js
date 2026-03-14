import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { URL } from 'node:url';

/**
 * gfpcom 插件
 * 目标：从 gfpcom wiki 获取代理列表
 * 格式：protocol://ip:port 或 protocol://user:pass@ip:port
 * 要求：忽略带验证的节点
 */

async function fetchFromEndpoint(url) {
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        // 使用 URL 解析器处理复杂的协议格式
        const parsed = new URL(trimmed);
        if (parsed.username || parsed.password) {
          // 忽略带验证的节点
          continue;
        }

        const protocol = parsed.protocol.replace(':', '');
        const ip = parsed.hostname;
        const port = parseInt(parsed.port, 10);

        if (ip && port > 0 && port <= 65535) {
          out.push({
            protocol,
            ip,
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'gfpcom'
          });
        }
      } catch (e) {
        // 如果不是协议开头的，尝试 fallback 或忽略
        continue;
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

async function run() {
  const endpoints = [
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/http.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/https.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/socks4.txt',
    'https://raw.githubusercontent.com/wiki/gfpcom/free-proxy-list/lists/socks5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  // 写入临时文件
  const outputPath = join(tmpdir(), `gfpcom-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  // 输出文件路径到 stdout
  console.log(outputPath);
  process.exit(0);
}

run();
