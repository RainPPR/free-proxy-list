import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * vakhov 插件
 * 目标：从 vakhov/fresh-proxy-list 获取代理列表
 * 格式：JSON 数组，包含 host, ip, port, country_code, city, 以及多种协议标识
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/refs/heads/master/proxylist.json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        // 协议检测逻辑
        let protocol = 'http';
        if (item.socks5 === '1') {
          protocol = 'socks5';
        } else if (item.socks4 === '1') {
          protocol = 'socks4';
        } else if (item.ssl === '1') {
          protocol = 'https';
        } else if (item.http === '1') {
          protocol = 'http';
        }

        // 提取地理位置信息作为 shortName 和 longName
        const countryCode = item.country_code || 'Unknown';
        const countryName = item.country_name || countryCode;
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: protocol,
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'vakhov'
        });
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `vakhov-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
