import { chromium } from 'playwright-chromium';
import fs from 'node:fs';
import * as cheerio from 'cheerio';

/**
 * 局部浏览器池管理器，用于解决内存泄漏
 * 每 20 个页面强制冷重启
 */
class BrowserManager {
    constructor() {
        this.browser = null;
        this.pageCount = 0;
        this.MAX_PAGES_BEFORE_RESTART = 20;
    }

    async getPage() {
        // 如果页面数超限或浏览器没启动，执行冷启动
        if (!this.browser || this.pageCount >= this.MAX_PAGES_BEFORE_RESTART) {
            await this.close();
            // console.log(`[Playwright] 启动浏览器引擎 (已抓取 ${this.pageCount} 页)`);
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-setuid-sandbox',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run'
                ]
            });
            this.pageCount = 0;
        }

        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });
        
        const pageInstance = await context.newPage();
        
        // 资源拦截优化：只保留文档和脚本（如果需要 JS 渲染）
        await pageInstance.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                return route.abort();
            }
            return route.continue();
        });

        this.pageCount++;
        return { page: pageInstance, context };
    }

    async close() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) { /* ignore */ }
            this.browser = null;
        }
    }
}

// 全局单例管理器
const manager = new BrowserManager();

export async function fetchProxies({ protocol = '', country = '', speed = '', page = 1 }) {
    const url = `https://www.freeproxy.world/?type=${protocol}&country=${country}&speed=${speed}&page=${page}`;
    
    let instance = null;
    try {
        instance = await manager.getPage();
        const { page: pageInstance, context } = instance;

        // 尝试使用更稳妥的等待方式
        const response = await pageInstance.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });

        if (response && !response.ok()) {
            console.warn(`[Playwright] 页面状态异常: ${response.status()} for ${url}`);
        }

        const html = await pageInstance.content();
        const $ = cheerio.load(html);
        const results = [];

        const rows = $('tr');
        // console.log(`[Playwright] 抓取完成: ${url}, Rows: ${rows.length}, Size: ${(html.length/1024).toFixed(1)}KB`);

        rows.each((_, row) => {
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

        await pageInstance.close();
        await context.close();
        return results;
    } catch (err) {
        console.error(`[Playwright] 抓取异常 (${url}): ${err.message}`);
        if (instance) {
            if (instance.page) try { await instance.page.close(); } catch (e) { /* ignore */ }
            if (instance.context) try { await instance.context.close(); } catch (e) { /* ignore */ }
        }
        return [];
    }
}

/**
 * 彻底释放资源
 */
export async function closeBrowser() {
    await manager.close();
}
