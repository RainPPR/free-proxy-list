import axios from 'axios';

/**
 * redscrape 插件
 * 目标：从 RedScrape API 获取代理列表
 */

export default async function fetch() {
  const url = 'https://free.redscrape.com/api/proxies?format=json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.address || !item.port || !item.protocol) continue;

        // 提取地理位置信息
        const countryCode = item.country_code || 'Unknown';
        const countryName = item.country || countryCode;
        // 示例中未见到 city 字段，但按规范预留
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: item.protocol.toLowerCase(),
          ip: item.address,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'redscrape'
        });
      }
    }

    return out;
  } catch (err) {
    return [];
  }
}
