import { fetchText } from '../../utils/fetch-utils.js';

/**
 * mmpx12 插件
 * 目标：从 mmpx12/proxy-list 获取代理列表 (格式 protocol://ip:port)
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/mmpx12/proxy-list/refs/heads/master/proxies.txt';
  
  try {
    const text = await fetchText(url, { timeout: 20000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const urlObj = new URL(trimmed);
        const protocol = urlObj.protocol.replace(':', '').toLowerCase();
        const ip = urlObj.hostname;
        const port = parseInt(urlObj.port, 10);

        if (ip && port > 0 && port <= 65535) {
          proxies.push({
            protocol,
            ip,
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'mmpx12'
          });
        }
      } catch (e) {
        // 如果不是标准 URL 格式，根据常见的分隔符尝试解析
        const parts = trimmed.split(/:\/\/|:/);
        if (parts.length >= 3) {
           // protocol://ip:port -> [protocol, ip, port]
           proxies.push({
             protocol: parts[0].toLowerCase(),
             ip: parts[1],
             port: parseInt(parts[2], 10),
             shortName: 'Unknown',
             longName: 'Unknown',
             remark: 'mmpx12'
           });
        }
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
