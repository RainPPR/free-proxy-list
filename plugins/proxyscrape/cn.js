import { fetchText } from '../../utils/fetch-utils.js';

/**
 * ProxyScrape CN 专属接口提取器 (V4 JSON 格式)
 */

export default async function fetch() {
  const url = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=cn&proxy_format=protocolipport&format=json&timeout=20000';
  
  try {
    const text = await fetchText(url, { timeout: 25000 });
    const data = text;
    
    // V4 JSON 格式通常包含一个 proxies 数组
    const rawNodes = data.proxies || [];
    const proxies = [];

    for (const p of rawNodes) {
      if (!p.ip || !p.port || !p.protocol) continue;
      
      proxies.push({
        protocol: p.protocol.toLowerCase(),
        ip: p.ip,
        port: parseInt(p.port, 10),
        shortName: 'CN',
        longName: 'China',
        remark: 'proxyscrape-cn'
      });
    }

    return proxies;
  } catch (err) {
    return [];
  }
}
