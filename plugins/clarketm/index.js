import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * clarketm 插件
 * 目标：从 clarketm/proxy-list 获取原始代理列表
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/clarketm/proxy-list/refs/heads/master/proxy-list-raw.txt';
  
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 20000 });
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
            protocol: 'http', // 用户要求全部当作 http
            ip: parts[0],
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'clarketm'
          });
        }
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `clarketm-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
