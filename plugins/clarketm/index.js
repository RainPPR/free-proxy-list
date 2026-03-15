import { fetchText } from '../../utils/fetch-utils.js';


/**
 * clarketm 插件
 * 目标：从 clarketm/proxy-list 获取原始代理列表
 */

export default async function fetch() {
  const url = 'https://raw.githubusercontent.com/clarketm/proxy-list/refs/heads/master/proxy-list-raw.txt';
  
  try {
    const text = await fetchText(url, { timeout: 20000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const port = parseInt(parts[1], 10);
        if (port > 0 && port <= 65535) {
          proxies.push({
            protocol: 'http',
            ip: parts[0],
            port,
            shortName: 'Unknown',
            longName: 'Unknown',
            remark: 'clarketm'
          });
        }
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}
