import axios from 'axios';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * iproyal-cn 插件
 * 目标：仅筛选国家为 China 的节点，同样支持认证与分页
 */

const AUTH_TOKEN = 'Bearer c07d9ce184008ff4be5ab6afa6a67a7513e5ece56e43b60ad1ddb0b86f952318e1ebebf54825bccb6191da8ad135cc29c963ce3f1c46dc4ad8364440333d6bee44ae20e3f0e63c29d3c5139c35f84b70d88b4e5de1e2f25cf07dca5d40fa5c0fa093490a5919e3269f2fa853776c59642c50b0cfc761c7f3943edd1908605661';

const COMMON_HEADERS = {
  'accept': '*/*',
  'authorization': AUTH_TOKEN,
  'referer': 'https://iproyal.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
};

async function fetchPage(page) {
  const url = `https://cms.iproyal.com/api/free-proxy-records?fields[0]=ip&fields[1]=port&fields[2]=protocol&fields[3]=country&fields[4]=city&pagination[page]=${page}&pagination[pageSize]=1000`;
  try {
    const res = await axios.get(url, { headers: COMMON_HEADERS, timeout: 30000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function run() {
  const results = [];
  
  try {
    const firstPage = await fetchPage(1);
    if (!firstPage || !Array.isArray(firstPage.data)) {
      process.exit(1);
    }

    results.push(...firstPage.data);
    const pageCount = firstPage.meta?.pagination?.pageCount || 1;

    if (pageCount > 1) {
      const promises = [];
      for (let p = 2; p <= pageCount; p++) {
        promises.push(fetchPage(p));
      }
      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent && Array.isArray(pageContent.data)) {
          results.push(...pageContent.data);
        }
      }
    }

    // 解析并提取，仅保留 China
    const out = results.map(item => {
      if (!item.ip || !item.port) return null;
      if (item.country !== 'China' && item.country !== 'CN' && item.country !== 'china') return null;

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
        remark: 'iproyal-cn'
      };
    }).filter(Boolean);

    const outputPath = join(tmpdir(), `iproyal-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();
