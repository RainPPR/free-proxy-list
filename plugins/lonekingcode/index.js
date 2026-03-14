import axios from 'axios';

/**
 * LoneKingCode 插件 (全球版)
 * 目标：从 LoneKingCode/free-proxy-db 获取代理列表
 */

async function fetchFromEndpoint(url) {
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        const countryCode = item.country || 'Unknown';
        // 由于没有提供全名且规范要求，暂用代码，除非后续有映射表
        const countryName = countryCode; 
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: item.protocol || 'http',
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'lonekingcode'
        });
      }
    }
    return out;
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
