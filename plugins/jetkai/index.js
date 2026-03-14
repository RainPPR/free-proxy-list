import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * jetkai 插件 (全球版)
 * 目标：从 jetkai/proxy-list 获取高级 JSON 格式代理列表
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/json/proxies-advanced.json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !Array.isArray(item.protocols)) continue;

        const loc = item.location || {};
        const countryCode = loc.isocode || 'Unknown';
        const countryName = loc.country || countryCode;
        const city = loc.city ? loc.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        for (const proto of item.protocols) {
          if (!proto.type || !proto.port) continue;

          out.push({
            protocol: proto.type.toLowerCase(),
            ip: item.ip,
            port: parseInt(proto.port, 10),
            shortName: shortName,
            longName: longName,
            remark: 'jetkai'
          });
        }
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `jetkai-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
