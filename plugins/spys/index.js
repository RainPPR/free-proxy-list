import { fetchText } from '../../utils/fetch-utils.js';

/**
 * spys 插件
 * 目标：从 spys.me 获取代理列表并解析非结构化文本
 * 格式：IP:PORT CountryCode-Anonymity...
 */

export default async function fetch() {
  const url = 'https://spys.me/proxy.txt';
  
  try {
    const text = await fetchText(url, { timeout: 20000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 匹配格式：1.2.3.4:8080 US-N...
      // 正则匹配 IP:PORT 和随后的国家代码
      const match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)\s+([A-Z]{2})-/);
      
      if (match) {
        const ip = match[1];
        const port = parseInt(match[2], 10);
        const countryCode = match[3];

        if (port > 0 && port <= 65535) {
          proxies.push({
            protocol: 'http', // 默认 http
            ip: ip,
            port: port,
            shortName: countryCode, 
            longName: countryCode, // 仅有简称，全称用简称代替
            remark: 'spys'
          });
        }
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
