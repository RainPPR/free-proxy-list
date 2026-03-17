/**
 * HTTP请求工具函数
 * 使用原生 fetch API，兼容 Bun 和 Node.js
 */

/**
 * 使用原生fetch获取文本内容，支持超时
 * @param {string} url - 要获取的URL
 * @param {Object} options - 选项
 * @param {number} options.timeout - 超时时间（毫秒）
 * @param {Object} options.headers - 请求头
 * @param {string} options.method - HTTP方法
 * @param {string|Object} options.body - 请求体
 * @param {string} options.responseType - 响应类型（'text', 'json'等）
 * @returns {Promise<string|Object>} - 响应数据
 */
export async function fetchText(url, { 
  timeout = 10000, 
  headers = {}, 
  method = 'GET',
  body = null,
  responseType = 'text' 
} = {}) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const fetchOptions = {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      },
      signal: controller.signal
    };

    if (body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!headers['Content-Type']) {
        fetchOptions.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    
    if (responseType === 'json') {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('Failed to parse JSON response');
      }
    }
    
    return text;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * 获取JSON数据
 * @param {string} url - URL
 * @param {Object} options - 选项
 * @returns {Promise<Object>} - JSON数据
 */
export async function fetchJson(url, options = {}) {
  return fetchText(url, { ...options, responseType: 'json' });
}

/**
 * 批量获取多个URL
 * @param {Array<string>} urls - URL数组
 * @param {Object} options - 选项
 * @returns {Promise<Array<any>>} - 结果数组
 */
export async function fetchAll(urls, options = {}) {
  return Promise.all(
    urls.map(url => fetchText(url, options).catch(error => {
      console.error(`Failed to fetch ${url}:`, error.message);
      return null;
    }))
  );
}

/**
 * POST请求
 * @param {string} url - URL
 * @param {Object|string} data - 请求数据
 * @param {Object} options - 选项
 * @returns {Promise<string|Object>} - 响应数据
 */
export async function fetchPost(url, data, options = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return fetchText(url, { 
    ...options, 
    method: 'POST', 
    body,
    headers: {
      ...options.headers,
      'Content-Type': typeof data === 'string' ? 'application/x-www-form-urlencoded' : 'application/json'
    }
  });
}
