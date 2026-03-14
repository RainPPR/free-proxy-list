import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { fetchProxies, closeBrowser } from './lib.js';

async function run() {
    const maxPages = parseInt(process.env.MAX_SCRAPE_PAGES) || 0;
    
    let finalResults = [];
    let currentPage = 1;
    let hitEnd = false;

    while (!hitEnd && (maxPages === 0 || currentPage <= maxPages)) {
        // 严格顺序抓取
        const results = await fetchProxies({ speed: '7500', page: currentPage });
        
        if (results && results.length > 0) {
            finalResults.push(...results);
            currentPage++;
            // 抓取间隔稍微拉大，减少对 CPU 的短时冲击
            await new Promise(r => setTimeout(r, 2000));
        } else {
            hitEnd = true;
        }

        if (maxPages > 0 && currentPage > maxPages) break;
    }

    // 彻底释放浏览器资源
    await closeBrowser();

    const outputPath = join(tmpdir(), `freeproxyworld-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalResults), 'utf-8');
    console.log(outputPath);
}

run();
