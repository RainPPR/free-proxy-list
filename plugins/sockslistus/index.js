import axios from 'axios';

/**
 * sockslist-us 插件 (全球版)
 * 目标：从 sockslist.us/Json 获取代理列表
 */

export default async function fetch() {
  const url = 'https://sockslist.us/Json';
  
  try {
    const res = await axios.get(url, { responseType: 'json', timeout: 20000 });
    const data = res.data;
    const out = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.ip || !item.port) continue;

        // 映射国家全称为简称 (简单逻辑，如果无法映射则用全称)
        const countryName = item.country || 'Unknown';
        let countryCode = countryName;
        if (countryName === 'United States') countryCode = 'US';
        else if (countryName === 'Singapore') countryCode = 'SG';
        else if (countryName === 'China') countryCode = 'CN';
        
        const city = item.city ? item.city.replace(/\s+/g, '') : '';

        const shortName = city ? `${countryCode}_${city}` : countryCode;
        const longName = city ? `${countryName}_${city}` : countryName;

        out.push({
          protocol: 'socks5', // 根据域名 sockslist 默认为 socks
          ip: item.ip,
          port: parseInt(item.port, 10),
          shortName: shortName,
          longName: longName,
          remark: 'sockslistus'
        });
      }
    }

    return out;
  } catch (err) {
    return [];
  }
}
