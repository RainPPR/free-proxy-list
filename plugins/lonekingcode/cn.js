import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * LoneKingCode-cn 插件
 * 目标：仅筛选国家代码为 CN 的节点
 */

async function fetchFromEndpoint(url) {
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;
        if (item.country !== 'CN') continue;

        const countryCode = 'CN';
        const countryName = 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: item.protocol || 'http',
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'lonekingcode-cn'
        });
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

async function run() {
  const endpoints = [
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/http.json',
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/socks4.json',
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/socks5.json'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  const outputPath = join(tmpdir(), `lonekingcode-cn-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(totalNodes), 'utf-8');
  
  console.log(outputPath);
  process.exit(0);
}

run();
