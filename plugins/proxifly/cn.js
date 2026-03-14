import https from 'https';
import zlib from 'zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * FreeProxyList CN 爬取器
 * 过滤仅保留中国大陆节点
 */

const TARGET_URL = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@master/proxies/all/data.json';

async function run() {
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
      process.exit(0);
      return;
    }

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
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const rawData = Buffer.concat(chunks).toString('utf-8');
    const cleaned = rawData.replace(/^\uFEFF/, '').trim();
    const list = JSON.parse(cleaned);

    if (!Array.isArray(list)) {
      process.exit(0);
      return;
    }

    const results = [];
    for (const item of list) {
      if (!item || !item.ip || !item.port || !item.protocol) continue;

      const geo = item.geolocation || {};
      const country = geo.country || 'Unknown';
      
      // 核心过滤逻辑：仅保留中国节点
      if (country !== 'CN') continue;

      const city = geo.city || '';

      results.push({
        protocol: item.protocol,
        ip: item.ip,
        port: item.port,
        shortName: city ? `${country}_${city}` : country,
        longName: city ? `${country} ${city}` : country,
        remark: 'freeproxylist-cn'
      });
    }

    const outputPath = join(tmpdir(), `freeproxylist-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(results), 'utf-8');
    
    console.log(outputPath);
    process.exit(0);

  } catch (err) {
    process.exit(0);
  }
}

run();
