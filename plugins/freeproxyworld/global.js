import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { fetchProxies } from './lib.js';

async function run() {
    const maxPages = parseInt(process.env.MAX_SCRAPE_PAGES) || 0;
    const maxWorkers = 4;
    
    let finalResults = [];
    let currentPage = 1;
    let hitEnd = false;

    while (!hitEnd && (maxPages === 0 || currentPage <= maxPages)) {
        const tasks = [];
        for (let i = 0; i < maxWorkers; i++) {
            if (maxPages > 0 && currentPage > maxPages) break;
            tasks.push(fetchProxies({ speed: '7500', page: currentPage }));
            currentPage++;
        }

        const batchResults = await Promise.all(tasks);
        let hasDataInBatch = false;

        for (const pageResults of batchResults) {
            if (pageResults && pageResults.length > 0) {
                finalResults.push(...pageResults);
                hasDataInBatch = true;
            } else {
                hitEnd = true;
            }
        }

        if (!hasDataInBatch) hitEnd = true;
        if (!hitEnd) await new Promise(r => setTimeout(r, 1500));
    }

    const outputPath = join(tmpdir(), `freeproxyworld-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalResults), 'utf-8');
    console.log(outputPath);
}

run();
