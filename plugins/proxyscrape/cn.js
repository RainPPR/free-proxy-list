import axios from 'axios';

/**
 * ProxyScrape CN 专属接口提取器 (V4 JSON 格式)
 */

export default async function fetch() {
  const url = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=cn&proxy_format=protocolipport&format=json&timeout=20000';
  
  try {
    const res = await axios.get(url, { timeout: 25000 });
    const data = res.data;
    
    // V4 JSON 格式通常包含一个 proxies 数组
    const proxies = data.proxies || [];
    const out = [];

    for (const p of proxies) {
      if (!p.ip || !p.port || !p.protocol) continue;
      
      out.push({
        protocol: p.protocol.toLowerCase(),
        ip: p.ip,
        port: parseInt(p.port, 10),
        shortName: 'CN',
        longName: 'China',
        remark: 'proxyscrape-cn'
      });
    }

    return out;
  } catch (err) {
    return [];
  }
}
