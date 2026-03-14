import https from 'https';
import zlib from 'zlib';


/**
 * FreeProxyList 爬取器
 * 数据源: proxifly/free-proxy-list GitHub 仓库
 * 正确处理 gzip 和 Brotli 压缩
 * 输出结果到临时文件
 */

const TARGET_URL = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@master/proxies/all/data.json';

export default async function fetch() {
  try {
    const response = await new Promise((resolve, reject) => {
      https.get(TARGET_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br'
              }
            }, (r) => resolve(r));
            return;
          }
        }
        resolve(res);
      }).on('error', reject);
    });

    if (response.statusCode !== 200) {
      return [];
    }

    // 处理压缩
    let stream = response;
    const encoding = response.headers['content-encoding'];
    
    if (encoding === 'br') {
      stream = response.pipe(zlib.createBrotliDecompress());
    } else if (encoding === 'gzip') {
      stream = response.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
      stream = response.pipe(zlib.createInflate());
    }

    const chunks = [];
    let totalSize = 0;
    const MAX_SIZE = 10 * 1024 * 1024;

    for await (const chunk of stream) {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        return [];
      }
    }

    const rawData = Buffer.concat(chunks).toString('utf-8');
    const cleaned = rawData.replace(/^\uFEFF/, '').trim();
    
    let list;
    try {
      list = JSON.parse(cleaned);
    } catch (parseErr) {
      return [];
    }

    if (!Array.isArray(list)) {
      return [];
    }

    const results = [];
    for (const item of list) {
      if (!item || !item.ip || !item.port || !item.protocol) continue;

      const geo = item.geolocation || {};
      const country = geo.country || 'Unknown';
      const city = geo.city || '';

      results.push({
        protocol: item.protocol,
        ip: item.ip,
        port: item.port,
        shortName: city ? `${country}_${city}` : country,
        longName: city ? `${country} ${city}` : country,
        remark: 'freeproxylist'
      });
    }

    return results;

  } catch (err) {
    return [];
  }
}