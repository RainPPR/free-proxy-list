import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * iplocate 插件
 * 目标：从 iplocate 获取代理列表
 * 格式：protocol://ip:port
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/iplocate/free-proxy-list/refs/heads/main/all-proxies.txt';
  
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 20000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配格式：protocol://ip:port
      const parts = trimmed.split('://');
      if (parts.length === 2) {
        const protocol = parts[0].toLowerCase();
        const address = parts[1].split(':');
        if (address.length === 2) {
          const ip = address[0];
          const port = parseInt(address[1], 10);

          if (ip && port > 0 && port <= 65535) {
            out.push({
              protocol: protocol,
              ip: ip,
              port: port,
              shortName: 'Unknown',
              longName: 'Unknown',
              remark: 'iplocate'
            });
          }
        }
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `iplocate-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
