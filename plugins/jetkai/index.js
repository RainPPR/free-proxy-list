import { fetchText } from '../../utils/fetch-utils.js';

/**
 * jetkai 插件 (全球版)
 * 目标：从 jetkai/proxy-list 获取高级 JSON 格式代理列表
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/json/proxies-advanced.json';
  
  try {
    const text = await fetchText(url, { responseType: 'json', timeout: 30000 });
    const data = text;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !Array.isArray(item.protocols)) continue;

        const loc = item.location || {};
        const countryCode = loc.isocode || 'Unknown';
        const countryName = loc.country || countryCode;
        const city = loc.city ? loc.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        for (const proto of item.protocols) {
          if (!proto.type || !proto.port) continue;

          proxies.push({
            protocol: proto.type.toLowerCase(),
            ip: item.ip,
            port: parseInt(proto.port, 10),
            shortName: shortName,
            longName: longName,
            remark: 'jetkai'
          });
        }
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
