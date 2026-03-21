/**
 * HTML解析实用工具
 * 深度重构为原生 Cheerio 接口，确保完美的正确性
 */
import * as cheerio from 'cheerio';

/**
 * 完整加载 HTML 并返回纯正的 Cheerio 实例
 * （这是绝大多数爬虫底层都极其依赖的标准化接口）
 * @param {string} html - HTML字符串
 * @returns {import('cheerio').CheerioAPI} - 标准的 $ 语法支持
 */
export function load(html) {
  return cheerio.load(html);
}

/**
 * 保留给某些特殊的历史代码使用的 parseHTML（若有）
 * 映射到底层的 Cheerio 功能
 */
export function parseHTML(html) {
  const $ = cheerio.load(html);
  
  return {
    load: (newHtml) => parseHTML(newHtml),
    find: (selector) => {
      const els = $(selector);
      return {
        length: els.length,
        each: (callback) => {
          els.each((index, element) => {
            callback(index, element);
          });
        },
        text: () => els.text().trim(),
        html: () => els.html()
      };
    },
    querySelectorAll: (selector) => $(selector).toArray(),
    querySelector: (selector) => $(selector).get(0),
    getText: (element) => $(element).text().trim(),
    getHtml: (element) => $(element).html()
  };
}