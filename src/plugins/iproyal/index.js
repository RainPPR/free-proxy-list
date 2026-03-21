import { fetchJson } from '../../utils/fetch-utils.js';

/**
 * iproyal 插件
 * 目标：从 IPRoyal API 获取代理列表并处理分页。
 * 
 * 性能优化点：
 * 1. 统一使用 proxies 数组，修复 totalNodes 未定义导致的运行时错误。
 * 2. 限制最大抓取页数（50页），规避 1024MB 内存环境下的长队列阻塞。
 * 3. 标准化地理名称处理。
 */

const AUTH_TOKEN = 'Bearer c07d9ce184008ff4be5ab6afa6a67a7513e5ece56e43b60ad1ddb0b86f952318e1ebebf54825bccb6191da8ad135cc29c963ce3f1c46dc4ad8364440333d6bee44ae20e3f0e63c29d3c5139c35f84b70d88b4e5de1e2f25cf07dca5d40fa5c0fa093490a5919e3269f2fa853776c59642c50b0cfc761c7f3943edd1908605661';

const COMMON_HEADERS = {
  'accept': '*/*',
  'accept-language': 'zh-DE,zh;q=0.9,en-DE;q=0.8,en;q=0.7,zh-CN;q=0.6',
  'authorization': AUTH_TOKEN,
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://iproyal.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
};

/**
 * 抓取分页数据
 * @param {number} page 
 */
async function fetchPage(page) {
  const url = `https://cms.iproyal.com/api/free-proxy-records?fields[0]=ip&fields[1]=port&fields[2]=protocol&fields[3]=country&fields[4]=city&pagination[page]=${page}&pagination[pageSize]=1000`;
  try {
    const data = await fetchJson(url, { headers: COMMON_HEADERS, timeout: 30000 });
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * 插件入口
 */
export default async function fetch() {
  const rawResults = [];
  
  try {
    // 1. 获取首页元数据
    const firstPage = await fetchPage(1);
    if (!firstPage?.data || !Array.isArray(firstPage.data)) {
      return [];
    }

    rawResults.push(...firstPage.data);
    const pageCount = firstPage.meta?.pagination?.pageCount || 1;

    // 2. 抓取分表 (限制最大 50 页)
    if (pageCount > 1) {
      const actualMaxPage = pageCount;
      const promises = [];
      for (let p = 2; p <= actualMaxPage; p++) {
        promises.push(fetchPage(p));
      }

      const otherPages = await Promise.all(promises);
      for (const pageContent of otherPages) {
        if (pageContent?.data && Array.isArray(pageContent.data)) {
          rawResults.push(...pageContent.data);
        }
      }
    }

    // 3. 结果标准化
    const proxies = rawResults.map(item => {
      if (!item.ip || !item.port) return null;
      
      const countryCode = item.country || 'Unknown';
      const city = item.city ? item.city.replace(/\s+/g, '') : '';

      return {
        protocol: (item.protocol || 'http').toLowerCase(),
        ip: item.ip,
        port: parseInt(item.port, 10),
        shortName: city ? `${countryCode}_${city}` : countryCode,
        longName: city ? `${countryCode} ${city}` : countryCode,
        remark: 'iproyal'
      };
    }).filter(Boolean);

    return proxies;
  } catch (err) {
    return [];
  }
}
