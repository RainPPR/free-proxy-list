import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * sockslist-us-cn 插件 (中国区专有 API)
 * 目标：从专用 API 获取中国区代理
 */

async function run() {
  const url = 'https://sockslist.us/Api?request=display&country=CHN&level=all&token=free';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        const countryCode = 'CN';
        const countryName = 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: 'socks5',
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'sockslistus-cn'
        });
      }
    }

    const outputPath = join(tmpdir(), `sockslistus-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
