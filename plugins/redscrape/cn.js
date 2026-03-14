import axios from 'axios';

/**
 * redscrape-cn 插件
 * 目标：筛选国家代码为 CN 的节点
 */

export default async function fetch() {
  const url = 'https://free.redscrape.com/api/proxies?format=json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.address || !item.port || !item.protocol) continue;
        if (item.country_code !== 'CN') continue;

        const countryCode = 'CN';
        const countryName = 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        proxies.push({
          protocol: item.protocol.toLowerCase(),
          ip: item.address,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'redscrape-cn'
        });
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
