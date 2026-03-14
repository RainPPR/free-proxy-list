import axios from 'axios';

/**
 * monosans 插件
 * 目标：从 monosans GitHub 获取 JSON 格式代理列表
 * 格式：数组对象，包含 protocol, host, port, geolocation 等
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/monosans/proxy-list/refs/heads/main/proxies_pretty.json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 30000 });
    const data = res.data;
    const proxies = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.host || !item.port || !item.protocol) continue;

        // 提取地理位置信息作为 shortName 和 longName
        const countryCode = item.geolocation?.country?.iso_code || 'Unknown';
        const countryName = item.geolocation?.country?.names?.en || countryCode;
        const city = item.geolocation?.city?.names?.en ? item.geolocation.city.names.en.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        proxies.push({
          protocol: item.protocol.toLowerCase(),
          ip: item.host,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'monosans'
        });
      }
    }

    return proxies;
  } catch (err) {
    // console.error(err.message);
    return [];
  }
}
