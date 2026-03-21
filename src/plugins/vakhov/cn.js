import { fetchJson } from '../../utils/fetch-utils.js';

/**
 * vakhov-cn 插件
 * 目标：从 vakhov/fresh-proxy-list 获取代理列表并仅筛选国家代码为 CN 的节点
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/refs/heads/master/proxylist.json';
  
  try {
    const text = await fetchJson(url, { timeout: 30000 });
    const data = text;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        // 仅筛选中国区节点
        if (item.country_code !== 'CN') continue;

        // 协议检测逻辑
        let protocol = 'http';
        if (item.socks5 === '1') {
          protocol = 'socks5';
        } else if (item.socks4 === '1') {
          protocol = 'socks4';
        } else if (item.ssl === '1') {
          protocol = 'https';
        } else if (item.http === '1') {
          protocol = 'http';
        }

        // 提取地理位置信息作为 shortName 和 longName
        const countryCode = 'CN';
        const countryName = item.country_name || 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        proxies.push({
          protocol: protocol,
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'vakhov-cn'
        });
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
