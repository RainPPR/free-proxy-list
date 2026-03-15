import { fetchText } from '../../utils/fetch-utils.js';
import { load } from '../../utils/html-utils.js';

/**
 * freeproxylist-cn 插件
 * 目标：从 free-proxy-list.net 获取代理列表并仅筛选中国区节点
 * 
 * 性能优化点：
 * 1. 使用 Bun.fetch 替代 axios 以减少 Buffer 操作开销。
 * 2. 移除原有的 totalNodes 错误引用。
 * 3. 使用内存内 Map 进行快速去重。
 */

const ENDPOINTS = [
  { url: 'https://free-proxy-list.net/en/freeproxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/socks-proxy.html', isSocks: true },
];

/**
 * 解析页面 HTML 提取 CN 节点
 * @param {string} html 
 * @param {boolean} isSocksPage 
 */
function parseTable(html, isSocksPage) {
  const $ = load(html);
  const rows = [];
  
  const table = $('#list > div > div.table-responsive > div > table');
  if (!table.length) return rows;
  
  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length >= 8) {
      const countryCode = $(tds[2]).text().trim().toUpperCase();
      
      // 严格筛选中国区节点
      if (countryCode !== 'CN') return;

      const ip = $(tds[0]).text().trim();
      const port = $(tds[1]).text().trim();
      
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
          const httpsValue = $(tds[5]).text().trim().toLowerCase();
          protocol = httpsValue === 'yes' ? 'https' : 'http';
        }

        rows.push({
          protocol,
          ip,
          port: parseInt(port, 10),
          shortName: 'CN',
          longName: 'China',
          remark: 'freeproxylist-cn'
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
      } catch (err) {
        continue;
      }
    }
    
    return Array.from(allProxies.values());
  } catch (err) {
    return [];
  }
}
