import { fetchJson } from '../../utils/fetch-utils.js';

/**
 * geonode-cn 插件
 * 目标：从 GeoNode API 获取代理列表并仅筛选中国区节点。
 * 
 * 性能优化点：
 * 1. 使用单一 proxies 数组管理内存，修复变量名一致性问题。
 * 2. 增强对 protocols 数组的健壮性检查。
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
    // 1. 获取首页数据
    const firstPage = await fetchPage(1);
    if (!firstPage?.data || !Array.isArray(firstPage.data)) {
      return [];
    }

    rawData.push(...firstPage.data);
    const total = firstPage.total || 0;
    const limit = firstPage.limit || 500;
    const maxPage = Math.ceil(total / limit);

    // 2. 抓取分表数据 (限制 50 页)
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

    // 3. 筛选并标准化中国区数据
    const proxies = rawData.map(item => {
      // 严格筛选 CN 且具备 IP/Port 的项
      if (!item.ip || !item.port || item.country !== 'CN') return null;

      const city = item.city ? item.city.replace(/\s+/g, '') : '';
      const protocol = (item.protocols && item.protocols.length > 0) 
        ? item.protocols[0].toLowerCase() 
        : 'http';

      return {
        protocol,
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: city ? `CN_${city}` : 'CN',
        longName: city ? `China ${city}` : 'China',
        remark: 'geonode-cn'
      };
    }).filter(Boolean);

    return proxies;
  } catch (err) {
    return [];
  }
}
