import https from 'https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const ENDPOINTS = [
  { url: 'https://free-proxy-list.net/en/freeproxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/socks-proxy.html', isSocks: true },
  { url: 'https://free-proxy-list.net/en/us-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/uk-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/anonymous-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/google-proxy.html', isSocks: false },
  { url: 'https://free-proxy-list.net/en/ssl-proxy.html', isSocks: false }
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

function parseTable(html, isSocksPage) {
  const $ = cheerio.load(html);
  const rows = [];
  
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
          // socks-proxy.html: Version 列 (第5列，索引4)
          const version = $(tds[4]).text().trim();
          if (version.toLowerCase().includes('socks4')) {
            protocol = 'socks4';
          } else if (version.toLowerCase().includes('socks5')) {
            protocol = 'socks5';
          } else {
            return; // 未知版本，跳过
          }
        } else {
          // 其他页面: Https 列 (第6列，索引5)
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

async function run() {
  try {
    const allProxies = new Map();
    
    for (const { url, isSocks } of ENDPOINTS) {
      try {
        const html = await fetchPage(url);
        const proxies = parseTable(html, isSocks);
        
        for (const proxy of proxies) {
          const key = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
          if (!allProxies.has(key)) {
            allProxies.set(key, proxy);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        continue;
      }
    }
    
    const result = Array.from(allProxies.values());
    
    // 写入临时文件
    const outputPath = join(tmpdir(), `freeproxy-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result), 'utf-8');
    console.log(outputPath);
    
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

run();