import axios from 'axios';

/**
 * freeproxydb 插件 (全球版)
 * 目标：从 freeproxydb.com 获取代理列表，支持自动分页
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

export default async function fetch() {
  const results = [];
  
  try {
    // 抓取第一页获取元数据
    const firstPage = await fetchPage(1);
    if (!firstPage || !firstPage.data || !Array.isArray(firstPage.data.data)) {
      return [];
    }

    results.push(...firstPage.data.data);

    const totalCount = firstPage.data.total_count || 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    // 抓取后续页面
    if (pageCount > 1) {
      // 限制并发以避免被封
      const maxPages = Math.min(pageCount, 50); // 最多抓取 50 页以防数据量过大
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

    // 解析并提取
    const out = results.map(item => {
      if (!item.ip || !item.port) return null;
      
      const countryCode = item.country || 'Unknown';
      const countryName = countryCode; // 接口由于只返回代码，暂用代码作为名称
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      const shortName = city ? `${countryCode}_${city}` : countryCode;
      const longName = city ? `${countryName}_${city}` : countryName;

      return {
        protocol: item.protocol || 'http',
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: shortName,
        longName: longName,
        remark: 'freeproxydb'
      };
    }).filter(Boolean);

    return totalNodes;
  } catch (err) {
    return [];
  }
}
