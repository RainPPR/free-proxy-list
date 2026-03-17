import { fetchText } from '../../utils/fetch-utils.js';
import { load } from '../../utils/html-utils.js';

/**
 * freeproxylist 主爬虫
 * 聚合多子页面源，支持自动解析与去重。
 * 
 * 性能优化点：
 * 1. 使用 Bun.fetch 替代 axios 以支持更智能的并发超时控制。
 * 2. 使用 Map 进行内存内去重。
 */

const ENDPOINTS = [
  { url: 'https://free-proxy-list.net/en/freeproxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/socks-proxy.html', isSocks: true },
  { url: 'https://free-proxy-list.net/en/us-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/uk-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/anonymous-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/google-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/ssl-proxy.html', isSocks: false }
];

/**
 * 解析表格 HTML
 * @param {string} html 
 * @param {boolean} isSocksPage 
 */
function parseTable(html, isSocksPage) {
  const $ = load(html);
  const rows = [];
  
  // 核心选择器：针对 free-proxy-list.net 的表格结构
  const table = $('#list > div > div.table-responsive > div > table');
  if (!table.length) return rows;
  
  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length >= 8) {
      const ip = $(tds[0]).text().trim();
      const port = $(tds[1]).text().trim();
      const countryCode = $(tds[2]).text().trim();
      const countryName = $(tds[3]).text().trim();
      
      if (ip && port && !isNaN(port)) {
        let protocol;
        if (isSocksPage) {
          const version = $(tds[4]).text().trim().toLowerCase();
          if (version.includes('socks4')) {
            protocol = 'socks4';
          } else if (version.includes('socks5')) {
            protocol = 'socks5';
          } else {
            return; 
          }
        } else {
          const https = $(tds[5]).text().trim().toLowerCase();
          protocol = https === 'yes' ? 'https' : 'http';
        }

        rows.push({
          protocol,
          ip,
          port: parseInt(port, 10),
          shortName: countryCode,
          longName: countryName,
          remark: 'freeproxylist'
        });
      }
    }
  });
  
  return rows;
}

/**
 * 插件入口
 */
export default async function fetch() {
  const allProxies = new Map();
  const timeoutLimit = 20000;
  
  try {
    for (const { url, isSocks } of ENDPOINTS) {
      try {
        const html = await fetchText(url, { 
          timeout: timeoutLimit,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const proxies = parseTable(html, isSocks);
        for (const p of proxies) {
          const key = `${p.protocol}://${p.ip}:${p.port}`;
          if (!allProxies.has(key)) {
            allProxies.set(key, p);
          }
        }
        
        // 礼貌抓取间隔
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        // 单源失败不阻塞全局
        continue;
      }
    }
    
    return Array.from(allProxies.values());
  } catch (err) {
    return [];
  }
}
