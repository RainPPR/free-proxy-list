import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * mmpx12 插件
 * 目标：从 mmpx12/proxy-list 获取代理列表 (格式 protocol://ip:port)
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/mmpx12/proxy-list/refs/heads/master/proxies.txt';
  
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 20000 });
    const lines = res.data.split('\n');
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const urlObj = new URL(trimmed);
        const protocol = urlObj.protocol.replace(':', '').toLowerCase();
        const ip = urlObj.hostname;
        const port = parseInt(urlObj.port, 10);

        if (ip && port > 0 && port <= 65535) {
          out.push({
            protocol,
            ip,
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'mmpx12'
          });
        }
      } catch (e) {
        // 如果不是标准 URL 格式，根据常见的分隔符尝试解析
        const parts = trimmed.split(/:\/\/|:/);
        if (parts.length >= 3) {
           // protocol://ip:port -> [protocol, ip, port]
           out.push({
             protocol: parts[0].toLowerCase(),
             ip: parts[1],
             port: parseInt(parts[2], 10),
             shortName: 'Unknown',
             longName: 'Unknown',
             remark: 'mmpx12'
           });
        }
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `mmpx12-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
