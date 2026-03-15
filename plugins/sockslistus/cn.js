import { fetchText } from '../../utils/fetch-utils.js';

/**
 * sockslist-us-cn 插件 (中国区专有 API)
 * 目标：从专用 API 获取中国区代理
 */

export default async function fetch() {
  const url = 'https://sockslist.us/Api?request=display&country=CHN&level=all&token=free';
  
  try {
    const text = await fetchText(url, { responseType: 'json', timeout: 20000 });
    const data = text;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        const countryCode = 'CN';
        const countryName = 'China';
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        proxies.push({
          protocol: 'socks5',
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'sockslistus-cn'
        });
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
