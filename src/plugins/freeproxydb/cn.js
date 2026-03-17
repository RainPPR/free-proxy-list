import { fetchText } from '../../utils/fetch-utils.js';

/**
 * freeproxydb-cn 插件
 * 目标：从 freeproxydb.com 获取代理列表并筛选出中国大陆节点
 * 
 * 性能优化点：
 * 1. 采用内存化 fetch 模式，移除临时文件 IO。
 * 2. 限制最大抓取页数以适配 1024MB 内存。
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
    const text = await fetchText(url, { timeout: 20000 });
    return text;
  } catch (err) {
    return null;
  }
}

/**
 * 插件入口：获取中国代理列表
 * @returns {Promise<Array>}
 */
export default async function fetch() {
  const rawResults = [];
  
  try {
    // 1. 获取首页
    const firstPage = await fetchPage(1);
    if (!firstPage?.data?.data || !Array.isArray(firstPage.data.data)) {
      return [];
    }

    rawResults.push(...firstPage.data.data);
    const totalCount = firstPage.data.total_count || 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    // 2. 抓取分表
    if (pageCount > 1) {
      const maxPages = Math.min(pageCount, 50);
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

    // 3. 筛选并格式化
    const proxies = rawResults.map(item => {
      // 严格筛选 CN 且具备 IP/Port 的项
      if (!item.ip || !item.port || item.country !== 'CN') return null;

      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      return {
        protocol: (item.protocol || 'http').toLowerCase(),
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: city ? `CN_${city}` : 'CN',
        longName: city ? `China ${city}` : 'China',
        remark: 'freeproxydb-cn'
      };
    }).filter(Boolean);

    return proxies;
  } catch (err) {
    return [];
  }
}
