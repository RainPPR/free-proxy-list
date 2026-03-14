import { chromium } from 'playwright-chromium';
import fs from 'node:fs';
import * as cheerio from 'cheerio';

/**
 * 使用 Playwright 执行极致内存优化的抓取
 */
export async function fetchProxies({ protocol = '', country = '', speed = '', page = 1 }) {
    const url = `https://www.freeproxy.world/?type=${protocol}&country=${country}&speed=${speed}&page=${page}`;
    
    let browser = null;
    try {
        // 启动极致简化的浏览器实例
        browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        const pageInstance = await context.newPage();

        // 核心优化：拦截并禁用所有非 HTML 资源，极大降低内存占用
        await pageInstance.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
                return route.abort();
            }
            return route.continue();
        });

        // 导航至目标页面
        await pageInstance.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 获取渲染后的 HTML
        const html = await pageInstance.content();
        const $ = cheerio.load(html);
        const results = [];

        $('tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length < 4) return;

            const ip = $(cells[0]).text().trim();
            if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return;

            const portText = $(cells[1]).find('a').length > 0 
                ? $(cells[1]).find('a').text().trim() 
                : $(cells[1]).text().trim();
            
            const port = parseInt(portText, 10);
            if (isNaN(port)) return;

            const countryNode = $(cells[2]).find('a[href*="country="]');
            let countryCode = country || 'Unknown';
            let countryName = 'Unknown';

            if (countryNode.length > 0) {
                const href = countryNode.attr('href') || '';
                const cMatch = href.match(/country=([A-Z]+)/);
                if (cMatch) countryCode = cMatch[1];
                const cTitle = countryNode.attr('title') || '';
                countryName = cTitle || countryNode.text().trim();
            }

            const city = $(cells[3]).find('span').first().text().trim();

            results.push({
                protocol: protocol || 'http',
                ip,
                port,
                shortName: city ? `${countryCode}_${city.replace(/\s+/g, '_')}` : countryCode,
                longName: city ? `${countryName} ${city}` : countryName,
                remark: 'freeproxyworld'
            });
        });

        return results;
    } catch (err) {
        console.error(`[Playwright] 抓取失败: ${err.message}`);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}
