import axios from 'axios';

/**
 * freeproxydb 插件 (全球版)
 * 目标：从 freeproxydb.com 获取代理列表，支持自动分页
 * 
 * 性能优化点：
 * 1. 限制最大抓取页数，避免单次采集周期过长导致内存堆积。
 * 2. 统一 ESM 导出接口与内部变量生命周期。
 */

const PAGE_SIZE = 100;
const BASE_URL = `https://freeproxydb.com/api/proxy/search?country=&protocol=socks5,http,socks4&anonymity=&speed=0,60&https=0&page_size=${PAGE_SIZE}`;

/**
 * 抓取单个分页数据
 * @param {number} pageIndex 
 */
async function fetchPage(pageIndex) {
  const url = `${BASE_URL}&page_index=${pageIndex}`;
  try {
    const res = await axios.get(url, { timeout: 20000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

/**
 * 插件入口：获取全球代理列表
 * @returns {Promise<Array>}
 */
export default async function fetch() {
  const rawResults = [];
  
  try {
    // 1. 抓取第一页获取元数据
    const firstPage = await fetchPage(1);
    if (!firstPage?.data?.data || !Array.isArray(firstPage.data.data)) {
      return [];
    }

    rawResults.push(...firstPage.data.data);

    const totalCount = firstPage.data.total_count || 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    // 2. 抓取后续页面
    if (pageCount > 1) {
      const maxPages = Math.min(pageCount, 50); // 防护性限制：最多抓取 50 页
      const promises = [];
      for (let p = 2; p <= maxPages; p++) {
        promises.push(fetchPage(p));
      }

      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent?.data?.data && Array.isArray(pageContent.data.data)) {
          rawResults.push(...pageContent.data.data);
        }
      }
    }

    // 3. 解析并标准化数据结构
    const proxies = rawResults.map(item => {
      if (!item.ip || !item.port) return null;
      
      const countryCode = item.country || 'Unknown';
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      return {
        protocol: (item.protocol || 'http').toLowerCase(),
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: city ? `${countryCode}_${city}` : countryCode,
        longName: city ? `${countryCode} ${city}` : countryCode,
        remark: 'freeproxydb'
      };
    }).filter(Boolean);

    return proxies;
  } catch (err) {
    return [];
  }
}
