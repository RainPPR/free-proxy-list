import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * geonode 插件
 * 目标：从 GeoNode API 获取代理列表并处理分页
 */

async function fetchPage(page) {
  const url = `https://proxylist.geonode.com/api/proxy-list?limit=500&page=${page}&sort_by=lastChecked&sort_type=desc`;
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    return res.data;
  } catch (err) {
    // console.error(`[GeoNode] Page ${page} failed: ${err.message}`);
    return null;
  }
}

async function run() {
  const results = [];
  
  try {
    // 抓取第一页获取元数据
    const firstPage = await fetchPage(1);
    if (!firstPage || !Array.isArray(firstPage.data)) {
      process.exit(1);
    }

    results.push(...firstPage.data);

    const total = firstPage.total;
    const limit = firstPage.limit || 500;
    const maxPage = Math.ceil(total / limit);

    // 抓取后续页面
    if (maxPage > 1) {
      const promises = [];
      // 为避免 API 频率限制，稍微分批或控制并发，但此处先并发处理
      for (let p = 2; p <= maxPage; p++) {
        promises.push(fetchPage(p));
      }

      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent && Array.isArray(pageContent.data)) {
          results.push(...pageContent.data);
        }
      }
    }

    // 解析并提取
    const out = results.map(item => {
      if (!item.ip || !item.port) return null;

      const countryCode = item.country || 'Unknown';
      const countryName = countryCode; // GeoNode API 只返回两个字母的国家代码
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      const shortName = city ? `${countryCode}_${city}` : countryCode;
      const longName = shortName; // 由于 API 仅有代码，全称用简称+城市代替

      return {
        protocol: (item.protocols && item.protocols[0]) ? item.protocols[0].toLowerCase() : 'http',
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: shortName,
        longName: longName,
        remark: 'geonode'
      };
    }).filter(Boolean);

    // 写入临时文件
    const outputPath = join(tmpdir(), `geonode-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    // 输出文件路径到 stdout
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
