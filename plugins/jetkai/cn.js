import axios from 'axios';

/**
 * jetkai-cn 插件
 * 目标：筛选国家代码为 CN 的节点
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/json/proxies-advanced.json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    const data = res.data;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !Array.isArray(item.protocols)) continue;
        const loc = item.location || {};
        if (loc.isocode !== 'CN') continue;

        const countryCode = 'CN';
        const countryName = 'China';
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
            remark: 'jetkai-cn'
          });
        }
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
