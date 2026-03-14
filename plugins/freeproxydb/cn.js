import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * freeproxydb-cn 插件
 * 目标：仅筛选国家为 CN 的节点，支持自动分页
 */

const PAGE_SIZE = 100;
const BASE_URL = 'https://freeproxydb.com/api/proxy/search?country=&protocol=socks5,http,socks4&anonymity=&speed=0,60&https=0&page_size=' + PAGE_SIZE;

async function fetchPage(pageIndex) {
  const url = `${BASE_URL}&page_index=${pageIndex}`;
  try {
    const res = await axios.get(url, { timeout: 20000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function run() {
  const results = [];
  
  try {
    const firstPage = await fetchPage(1);
    if (!firstPage || !firstPage.data || !Array.isArray(firstPage.data.data)) {
      process.exit(1);
    }

    results.push(...firstPage.data.data);
    const totalCount = firstPage.data.total_count || 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    if (pageCount > 1) {
      const maxPages = Math.min(pageCount, 50);
      const promises = [];
      for (let p = 2; p <= maxPages; p++) {
        promises.push(fetchPage(p));
      }
      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent && pageContent.data && Array.isArray(pageContent.data.data)) {
          results.push(...pageContent.data.data);
        }
      }
    }

    // 解析并提取，仅保留 China
    const out = results.map(item => {
      if (!item.ip || !item.port) return null;
      if (item.country !== 'CN') return null;

      const countryCode = 'CN';
      const countryName = 'China';
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      const shortName = city ? `${countryCode}_${city}` : countryCode;
      const longName = city ? `${countryName}_${city}` : countryName;

      return {
        protocol: item.protocol || 'http',
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: shortName,
        longName: longName,
        remark: 'freeproxydb-cn'
      };
    }).filter(Boolean);

    const outputPath = join(tmpdir(), `freeproxydb-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
