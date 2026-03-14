import axios from 'axios';

/**
 * geonode-cn 插件
 * 目标：从 GeoNode API 获取代理列表并处理分页，仅筛选中国区节点
 */

async function fetchPage(page) {
  const url = `https://proxylist.geonode.com/api/proxy-list?limit=500&page=${page}&sort_by=lastChecked&sort_type=desc`;
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

export default async function fetch() {
  const results = [];
  
  try {
    const firstPage = await fetchPage(1);
    if (!firstPage || !Array.isArray(firstPage.data)) {
      return [];
    }

    results.push(...firstPage.data);

    const total = firstPage.total;
    const limit = firstPage.limit || 500;
    const maxPage = Math.ceil(total / limit);

    if (maxPage > 1) {
      const promises = [];
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

    // 解析并提取，仅保留中国区
    const out = results.map(item => {
      if (!item.ip || !item.port || item.country !== 'CN') return null;

      const countryCode = 'CN';
      const countryName = 'China';
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      const shortName = city ? `${countryCode}_${city}` : countryCode;
      const longName = city ? `${countryName}_${city}` : countryName;

      return {
        protocol: (item.protocols && item.protocols[0]) ? item.protocols[0].toLowerCase() : 'http',
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: shortName,
        longName: longName,
        remark: 'geonode-cn'
      };
    }).filter(Boolean);

    return totalNodes;
  } catch (err) {
    return [];
  }
}
