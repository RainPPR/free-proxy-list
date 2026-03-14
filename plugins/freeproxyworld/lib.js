import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/'
};

export async function fetchProxies({ protocol = '', country = '', speed = '', page = 1 }) {
    const url = `https://www.freeproxy.world/?type=${protocol}&country=${country}&speed=${speed}&page=${page}`;
    
    try {
        const response = await fetch(url, {
            headers: BASE_HEADERS,
            method: 'GET'
        });

        if (!response.ok) return [];

        const html = await response.text();
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
        return [];
    }
}
