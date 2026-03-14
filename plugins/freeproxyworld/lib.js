import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { createCursor } from 'ghost-cursor';
import * as cheerio from 'cheerio';

// 基础 Stealth 插件
chromium.use(stealth());

const fingerprintGenerator = new FingerprintGenerator();
const fingerprintInjector = new FingerprintInjector();

/**
 * 局部浏览器池管理器 (UC 模式复刻)
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
            
            // 复刻 UC 模式核心：使用 --headless=new 驱动完整 Chrome 引擎
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-setuid-sandbox',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run',
                    '--window-size=1920,1080',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                ]
            });
            this.pageCount = 0;
        }

        // 生成真实设备指纹
        const fingerprint = fingerprintGenerator.getFingerprint({
            devices: ['desktop'],
            browsers: [{ name: 'chrome', minVersion: 120 }]
        });

        const context = await this.browser.newContext({
            ...fingerprint.fingerprint.browserContextOptions,
            viewport: { width: 1920, height: 1080 }
        });
        
        const pageInstance = await context.newPage();

        // 注入工业级指纹 (解决 CDP 检测)
        await fingerprintInjector.attachFingerprintToPlaywright(context, fingerprint);
        
        // 极致性能优化：黑名单 + 资源类型拦截
        await pageInstance.route('**/*', (route) => {
            const request = route.request();
            const url = request.url().toLowerCase();
            const type = request.resourceType();

            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                return route.abort();
            }

            const blockPatterns = ['google', 'analytics', 'googletagmanager', 'cloudflareinsights', 'beacon.min.js'];
            if (blockPatterns.some(p => url.includes(p))) {
                return route.abort();
            }

            return route.continue();
        });

        this.pageCount++;
        return { page: pageInstance, context };
    }

    async close() {
        if (this.browser) {
            try { await this.browser.close(); } catch (e) { /* ignore */ }
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

        // 模拟 UC 的 uc_open_with_reconnect：先通过 goto 出发，但不立即解析
        const response = await pageInstance.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        if (response && response.status() === 403) {
            console.warn(`[Playwright] 检测到 Cloudflare 盾 (403)，开始执行行为模拟绕过...`);
            // 模拟人类行为：鼠标平滑滑动
            const cursor = createCursor(pageInstance);
            await cursor.move({ x: Math.random() * 500, y: Math.random() * 500 });
            await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000)); // 等待 5-8 秒
        }

        const html = await pageInstance.content();
        const $ = cheerio.load(html);
        const results = [];

        $('table.table tbody tr').each((_, row) => {
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

export async function closeBrowser() {
    await manager.close();
}
