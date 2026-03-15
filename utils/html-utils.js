/**
 * HTML解析实用工具，提供类似cheerio的功能
 * 使用Bun内置的HTML解析器
 */

/**
 * 解析HTML字符串，返回类似cheerio的选择器接口
 * @param {string} html - HTML字符串
 * @returns {Object} - 选择器对象
 */
export function parseHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  return {
    /**
     * 类似cheerio的加载器
     */
    load: (html) => parseHTML(html),
    
    /**
     * 类似cheerio的选择器
     * @param {string} selector - CSS选择器
     * @returns {Object} - 匹配元素集合
     */
    find: (selector) => {
      const elements = doc.querySelectorAll(selector);
      return {
        length: elements.length,
        each: (callback) => {
          elements.forEach((element, index) => {
            callback(index, element);
          });
        },
        text: () => elements.length > 0 ? elements[0].textContent.trim() : '',
        html: () => elements.length > 0 ? elements[0].innerHTML : ''
      };
    },
    
    /**
     * 直接查询所有匹配元素
     * @param {string} selector - CSS选择器
     * @returns {NodeList} - 匹配的元素列表
     */
    querySelectorAll: (selector) => doc.querySelectorAll(selector),
    
    /**
     * 查询单个元素
     * @param {string} selector - CSS选择器
     * @returns {Element|null} - 匹配的元素
     */
    querySelector: (selector) => doc.querySelector(selector),
    
    /**
     * 获取元素的文本内容
     * @param {Element} element - DOM元素
     * @returns {string} - 文本内容
     */
    getText: (element) => element.textContent.trim(),
    
    /**
     * 获取元素的HTML内容
     * @param {Element} element - DOM元素
     * @returns {string} - HTML内容
     */
    getHtml: (element) => element.innerHTML
  };
}

/**
 * 简化的cheerio兼容接口
 * @param {string} html - HTML字符串
 * @returns {Object} - cheerio-like对象
 */
export function load(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const $ = (selector) => {
    const elements = doc.querySelectorAll(selector);
    return {
      length: elements.length,
      each: (callback) => {
        elements.forEach((element, index) => {
          callback(index, element);
        });
      },
      map: (callback) => {
        const results = [];
        elements.forEach((element, index) => {
          results.push(callback(index, element));
        });
        return results;
      },
      text: () => elements.length > 0 ? elements[0].textContent.trim() : '',
      html: () => elements.length > 0 ? elements[0].innerHTML : '',
      find: (subSelector) => {
        if (elements.length === 0) return { length: 0, each: () => {} };
        const subElements = elements[0].querySelectorAll(subSelector);
        return {
          length: subElements.length,
          each: (callback) => {
            subElements.forEach((element, index) => {
              callback(index, element);
            });
          },
          text: () => subElements.length > 0 ? subElements[0].textContent.trim() : ''
        };
      },
      eq: (index) => {
        if (index >= 0 && index < elements.length) {
          const element = elements[index];
          return {
            text: () => element.textContent.trim(),
            html: () => element.innerHTML,
            find: (subSelector) => {
              const subElements = element.querySelectorAll(subSelector);
              return {
                length: subElements.length,
                each: (callback) => {
                  subElements.forEach((el, idx) => {
                    callback(idx, el);
                  });
                },
                text: () => subElements.length > 0 ? subElements[0].textContent.trim() : ''
              };
            }
          };
        }
        return { text: () => '', html: () => '', find: () => ({ length: 0, each: () => {} }) };
      }
    };
  };
  
  $.prototype = {};
  
  return $;
}