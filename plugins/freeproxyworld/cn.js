import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { fetchProxies, closeBrowser } from './lib.js';

async function run() {
    const maxPages = parseInt(process.env.MAX_SCRAPE_PAGES) || 0;
    
    let finalResults = [];
    let currentPage = 1;
    let hitEnd = false;

    // 中国优先
    while (!hitEnd && (maxPages === 0 || currentPage <= maxPages)) {
        const results = await fetchProxies({ country: 'CN', page: currentPage });
        
        if (results && results.length > 0) {
            finalResults.push(...results);
            currentPage++;
            await new Promise(r => setTimeout(r, 2000));
        } else {
            hitEnd = true;
        }

        if (maxPages > 0 && currentPage > maxPages) break;
    }

    await closeBrowser();

    const outputPath = join(tmpdir(), `freeproxyworld-cn-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalResults), 'utf-8');
    console.log(outputPath);
}

run();
