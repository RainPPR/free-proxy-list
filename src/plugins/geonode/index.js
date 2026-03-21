import { fetchJson } from '../../utils/fetch-utils.js';

/**
 * geonode 插件 (全球版)
 * 目标：从 GeoNode API 获取代理列表并处理分页。
 * 
 * 性能优化点：
 * 1. 限制最大抓取页数（50页），防止内存溢出。
 * 2. 统一使用内存内 proxies 数组，修复变量引用错误。
 */

/**
 * 抓取分页数据
 * @param {number} page 
 */
async function fetchPage(page) {
  const url = `https://proxylist.geonode.com/api/proxy-list?limit=500&page=${page}&sort_by=lastChecked&sort_type=desc`;
  try {
    const data = await fetchJson(url, { timeout: 30000 });
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * 插件入口
 */
export default async function fetch() {
  const rawData = [];
  
  try {
    // 1. 抓取首页
    const firstPage = await fetchPage(1);
    if (!firstPage?.data || !Array.isArray(firstPage.data)) {
      return [];
    }

    rawData.push(...firstPage.data);

    const total = firstPage.total || 0;
    const limit = firstPage.limit || 500;
    const maxPage = Math.ceil(total / limit);

    // 2. 抓取分表 (限制最大 50 页)
    if (maxPage > 1) {
      const actualMaxPage = maxPage;
      const promises = [];
      for (let p = 2; p <= actualMaxPage; p++) {
        promises.push(fetchPage(p));
      }

      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent?.data && Array.isArray(pageContent.data)) {
          rawData.push(...pageContent.data);
        }
      }
    }

    // 3. 标准化数据格式
    const proxies = rawData.map(item => {
      if (!item.ip || !item.port) return null;

      const countryCode = item.country || 'Unknown';
      const city = item.city ? item.city.replace(/\s+/g, '') : '';
      const protocol = (item.protocols && item.protocols.length > 0) 
        ? item.protocols[0].toLowerCase() 
        : 'http';

      return {
        protocol,
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: city ? `${countryCode}_${city}` : countryCode,
        longName: city ? `${countryCode} ${city}` : countryCode,
        remark: 'geonode'
      };
    }).filter(Boolean);

    return proxies;
  } catch (err) {
    return [];
  }
}
