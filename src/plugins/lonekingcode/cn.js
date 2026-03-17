import { fetchText } from '../../utils/fetch-utils.js';

/**
 * LoneKingCode-cn 插件
 * 目标：仅筛选国家代码为 CN 的节点
 */

async function fetchFromEndpoint(url) {
  try {
    const text = await fetchText(url, { responseType: 'json', timeout: 20000 });
    const data = text;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;
        if (item.country !== 'CN') continue;

        const countryCode = 'CN';
        const countryName = 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        proxies.push({
          protocol: item.protocol || 'http',
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'lonekingcode-cn'
        });
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/http.json',
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/socks4.json',
    'https://raw.githubusercontent.com/LoneKingCode/free-proxy-db/refs/heads/main/proxies/socks5.json'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
