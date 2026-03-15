import { fetchText } from '../../utils/fetch-utils.js';
;


/**
 * roosterkid 插件 (全球版)
 * 目标：从 roosterkid/openproxylist 获取多协议代理列表
 * 格式示例：🇷🇺 87.117.11.57:1080 763ms RU [ISP]
 */

async function fetchFromEndpoint(url) {
  try {
    const protocol = basename(url).replace('.txt', '').toLowerCase();
    const text = await fetchText(url, { timeout: 20000 });
    const lines = text.split('\n');
    const proxies = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('SOCKS') || trimmed.startsWith('Website') || trimmed.startsWith('Support') || trimmed.includes('BTC') || trimmed.includes('ETH')) continue;

      // 使用正则表达式匹配 IP:PORT 和国家代码
      // 🇷🇺 87.117.11.57:1080 763ms RU [ISP]
      // 我们需要跳过开头的 Emoji
      const parts = trimmed.split(/\s+/);
      
      // 预期结构: [Emoji, IP:PORT, Latency, CountryCode, ...ISP]
      // 有时可能没有 Emoji，或者格式略有差异，做健壮处理
      let ipPort = '';
      let countryCode = '';

      for (const part of parts) {
        if (part.includes(':') && part.split(':').length === 2 && /^\d/.test(part)) {
          ipPort = part;
        } else if (part.length === 2 && /^[A-Z]{2}$/.test(part)) {
          countryCode = part;
        }
      }

      if (ipPort) {
        const [ip, port] = ipPort.split(':');
        proxies.push({
          protocol,
          ip,
          port: parseInt(port, 10),
          shortName: countryCode || 'Unknown',
          longName: countryCode || 'Unknown',
          remark: 'roosterkid'
        });
      }
    }
    return proxies;
  } catch (err) {
    return [];
  }
}

export default async function fetch() {
  const endpoints = [
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/HTTPS.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/SOCKS4.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/SOCKS5.txt'
  ];

  let totalNodes = [];

  const promises = endpoints.map(u => fetchFromEndpoint(u));
  const resultsArr = await Promise.all(promises);

  for (const arr of resultsArr) {
    totalNodes = totalNodes.concat(arr);
  }

  return totalNodes;
}
