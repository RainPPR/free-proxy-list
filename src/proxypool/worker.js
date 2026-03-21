import { runAllFetchers } from './fetchers.js';

let proxyCache = [];
let isFetching = false;

// 独立服务的核心循环抓取间隔 (例如每 15 分钟抓一次)
const FETCH_INTERVAL_MS = 15 * 60 * 1000;

async function doFetch() {
  if (isFetching) return;
  isFetching = true;
  try {
    const newProxies = await runAllFetchers();
    
    // 合并并去重
    const urlMap = new Map();
    for (const p of proxyCache.concat(newProxies)) {
      urlMap.set(`${p.ip}:${p.port}`, p);
    }
    proxyCache = Array.from(urlMap.values());
    
    console.log(`[Proxypool Worker] 抓取完成，当前内存池拥有 ${proxyCache.length} 个代理节点。`);
    
    // 强制垃圾回收
    if (typeof Bun !== 'undefined' && Bun.gc) {
      Bun.gc(true);
    }
  } catch (err) {
    console.error(`[Proxypool Worker] 抓取异常: ${err.message}`);
  } finally {
    isFetching = false;
  }
}

// 接收主线程的通信消息
self.onmessage = async (event) => {
  const { type } = event.data;
  if (type === 'GET') {
    // 发送当前收集到的 proxyCache，然后清空
    self.postMessage({ type: 'PROXY_DATA', data: proxyCache });
    proxyCache = [];
  } else if (type === 'TRIGGER') {
    // 主动触发一次抓取
    doFetch();
  }
};

// 启动定时任务
setInterval(doFetch, FETCH_INTERVAL_MS);

// 启动时先抓取一次
doFetch();
console.log(`[Proxypool Worker] 独立服务已启动在后台线程，准备接收主线程调用。`);
