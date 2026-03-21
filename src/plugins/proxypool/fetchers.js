import { logger } from '../../config.js';

// 获取 IP:PORT 的通用正则
const IP_PORT_REGEX = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:[\s:<>\/a-zA-Z"=-]+?)(\d{2,5})\b/g;
const STRICT_IP_PORT_REGEX = /\b((?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)):(\d{2,5})\b/g;

/**
 * 通用提取函数，接受 HTML 或文本，返回解析后的 {ip, port, protocol: 'http'} 数组
 */
function extractProxies(text) {
  const proxies = [];
  const matches = [...text.matchAll(IP_PORT_REGEX)];
  for (const match of matches) {
    const fullMatch = match[0];
    const port = match[1];
    let ip = match[0].match(/(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/);
    if (ip && port) {
      proxies.push({ ip: ip[0], port: parseInt(port, 10), protocol: 'http' });
    }
  }

  // 尝试 STRICT 匹配兜底
  const strictMatches = [...text.matchAll(STRICT_IP_PORT_REGEX)];
  for (const match of strictMatches) {
    proxies.push({ ip: match[1], port: parseInt(match[2], 10), protocol: 'http' });
  }

  // 去重
  const uniqueProxies = [];
  const seen = new Set();
  for (const p of proxies) {
    const key = `${p.ip}:${p.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProxies.push(p);
    }
  }

  return uniqueProxies;
}

/**
 * 带有 User-Agent 伪装的通用抓取
 */
async function fetchGeneric(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'
      },
      signal: AbortSignal.timeout(10000) // Bun standard timeout
    });
    if (!res.ok) return [];
    const text = await res.text();
    return extractProxies(text);
  } catch (err) {
    // Silently skip failed URLs to keep logs clean during massive scraping
    return [];
  }
}

// 代理源列表，结合四份 Python 脚本中的免费代理源
const SOURCES = [
  // 'http://www.66ip.cn/',
  'http://www.kxdaili.com/dailiip.html',
  'http://www.kxdaili.com/dailiip/2/1.html',
  'https://www.free-proxy-list.net/',
  'https://www.sslproxies.org/',
  'https://advanced.name/freeproxy/667e4f3871c2f',
  'https://www.freeproxy.world/?country=US',
  'https://www.echolink.org/proxylist.jsp',
  'https://www.iplocation.net/proxy-list',
  'https://2ip.io/proxy/',
  'https://hidemy.life/en/proxy-list-servers',
  'https://freeproxylist.cc',
  'http://free-proxy.cz/ru/proxylist/country/all/socks5/ping/all',
  'https://spys.one/socks/',
  'https://premiumproxy.net/socks-proxy-list'
];

export async function runAllFetchers() {
  const allProxies = [];
  
  // 并发抓取所有源
  const promises = SOURCES.map(async (url) => {
    const p = await fetchGeneric(url);
    return p;
  });

  const results = await Promise.allSettled(promises);
  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      allProxies.push(...res.value);
    }
  }

  // 整体去重
  const uniqueProxies = [];
  const seen = new Set();
  for (const p of allProxies) {
    // 简单设置类型。根据 URL 其实可以区分 socks/http，为了简化以及后续有 validator 进行严格测试，目前均置为 http/socks 均可，交由 Validator 去推断。但按 python 逻辑，提取的都是 IP:Port，我们在系统里暂标 'http'
    const key = `${p.ip}:${p.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProxies.push(p);
    }
  }

  return uniqueProxies;
}
