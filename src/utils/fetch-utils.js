/**
 * HTTP请求工具函数
 * 使用 axios 重构，强化连接稳定性（keepAlive/重试）、证书防拦截并加强 Header 反爬虫伪装
 */
import axios from 'axios';
import http from 'http';
import https from 'https';

// 启用 KeepAlive 以及忽略证书错误，对高强度的代理爬虫极其有用
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  headers: DEFAULT_HEADERS,
  maxRedirects: 5,
  decompress: true // 自动处理 gzip/deflate 解析异常
});

/**
 * 具有自动重试和深层抗屏蔽能力的 fetch 封装
 * @param {string} url - 要获取的URL
 * @param {Object} options - 选项（包括 timeout, headers, method, body 等）
 * @param {number} retries - 失败后重试次数，默认 2 次
 * @returns {Promise<string|Object>} - 响应数据
 */
export async function fetchText(url, options = {}, retries = 2) {
  const { 
    timeout = 10000, 
    headers = {}, 
    method = 'GET',
    body = null,
    responseType = 'text' 
  } = options;
  
  let lastError;
  
  const config = {
    method,
    url,
    timeout,
    headers: { ...DEFAULT_HEADERS, ...headers },
    // 允许任何返回状态，即使非 200 也会作为响应处理，除非严格被拦截
    validateStatus: (status) => status >= 200 && status < 400
  };

  if (body) {
    config.data = body;
    if (typeof body !== 'string' && !headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  // 增加重试机制来抵抗网络抖动。很多代理发布站的带宽很差。
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axiosInstance(config);
      
      if (responseType === 'json') {
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      }
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      
    } catch (err) {
      lastError = err;
      if (i === retries) {
        throw new Error(`[FetchTask] ${url} 经过 ${retries} 次重试依旧失败: ${err.message}`);
      }
      // 等待 1s, 2s... 退避后重试
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
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
 * 批量获取多个URL (容错)
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
