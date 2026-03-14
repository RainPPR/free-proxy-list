import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * monosans-cn 插件
 * 目标：从 monosans GitHub 获取代理列表，并仅筛选国家代码为 CN 的节点
 */

async function run() {
  const url = 'https://raw.githubusercontent.com/monosans/proxy-list/refs/heads/main/proxies_pretty.json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.host || !item.port || !item.protocol) continue;

        // 仅筛选中国区节点
        const countryCode = item.geolocation?.country?.iso_code || '';
        if (countryCode !== 'CN') continue;

        // 提取地理位置信息作为 shortName 和 longName
        const countryName = item.geolocation?.country?.names?.en || 'China';
        const city = item.geolocation?.city?.names?.en ? item.geolocation.city.names.en.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: item.protocol.toLowerCase(),
          ip: item.host,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'monosans-cn'
        });
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `monosans-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
