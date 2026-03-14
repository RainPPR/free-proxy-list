import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * monosans 插件
 * 目标：从 monosans GitHub 获取 JSON 格式代理列表
 * 格式：数组对象，包含 protocol, host, port, geolocation 等
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

        // 提取地理位置信息作为 shortName 和 longName
        const countryCode = item.geolocation?.country?.iso_code || 'Unknown';
        const countryName = item.geolocation?.country?.names?.en || countryCode;
        const city = item.geolocation?.city?.names?.en ? item.geolocation.city.names.en.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: item.protocol.toLowerCase(),
          ip: item.host,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'monosans'
        });
      }
    }

    // 写入临时文件
    const outputPath = join(tmpdir(), `monosans-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    // console.error(err.message);
    process.exit(1);
  }
}

run();
