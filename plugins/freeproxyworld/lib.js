import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'node:fs';
import * as cheerio from 'cheerio';

// 使用 stealth 插件
chromium.use(stealth());

/**
 * 极致优化：资源拦截黑名单
 * 包含广告、追踪、分析及非必要 CDN 资源域名关键字
 */
const BLOCK_RESOURCE_PATTERNS = [
    'google', 'analytics', 'googletagmanager', 'googlesyndication',
    'cloudflareinsights', 'beacon.min.js', 'doubleclick', 'amazon-adsystem',
    'facebook.net'
];

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
        if (!this.browser || this.pageCount >= this.MAX_PAGES_BEFORE_RESTART) {
            await this.close();
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
        
        // 极致性能优化：黑名单 + 资源类型双重拦截
        await pageInstance.route('**/*', (route) => {
            const request = route.request();
            const url = request.url().toLowerCase();
            const type = request.resourceType();

            // 1. 资源类型拦截：图片、样式表、字体、媒体
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                return route.abort();
            }

            // 2. 域名/脚本黑名单检测 (广告与追踪)
            if (BLOCK_RESOURCE_PATTERNS.some(p => url.includes(p))) {
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

const manager = new BrowserManager();

export async function fetchProxies({ protocol = '', country = '', speed = '', page = 1 }) {
    const url = `https://www.freeproxy.world/?type=${protocol}&country=${country}&speed=${speed}&page=${page}`;
    
    let instance = null;
    try {
        instance = await manager.getPage();
        const { page: pageInstance, context } = instance;

        // waitUntil 使用 domcontentloaded 以加速，因为后续资源都被拦截了
        const response = await pageInstance.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });

        if (response && !response.ok()) {
            console.warn(`[Playwright] 状态异常: ${response.status()} for ${url}`);
        }

        const html = await pageInstance.content();
        const $ = cheerio.load(html);
        const results = [];

        // 根据 example.html 源码分析，Proxy 数据在 <tbody> 的 <tr> 中
        $('table.table tbody tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length < 4) return;

            const ip = $(cells[0]).text().trim();
            // 验证 IP 格式，排除广告行
            if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return;

            const portText = $(cells[1]).find('a').length > 0 
                ? $(cells[1]).find('a').text().trim() 
                : $(cells[1]).text().trim();
            
            const port = parseInt(portText, 10);
            if (isNaN(port)) return;

            // 国家与城市提取
            const countryNode = $(cells[2]).find('a[href*="country="]');
            let countryCode = country || 'Unknown';
            let countryName = 'Unknown';

            if (countryNode.length > 0) {
                const href = countryNode.attr('href') || '';
                const cMatch = href.match(/country=([A-Z]+)/);
                if (cMatch) countryCode = cMatch[1];
                countryName = (countryNode.attr('title') || countryNode.text()).trim();
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
        console.error(`[Playwright] 抓取失败 (${url}): ${err.message}`);
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
